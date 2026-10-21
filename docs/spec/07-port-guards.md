# 07 — Port guards

Who can reach a published port, shown and controlled from Nautix. Three levels, built in this order; each one ships on its own and none of them requires the next.

| Level | What it controls | Needs privileges | Works on |
|---|---|---|---|
| 1. Exposure | The address a port is published on | No | Everywhere Docker runs |
| 2. Gateway filters | Source IPs allowed on an HTTP route | No | Everywhere a gateway adapter exists |
| 3. Host firewall | Source networks allowed per port, any protocol | Yes, in a separate helper | Linux hosts (iptables / nftables) |

**Non-goals.** Replacing the cloud provider's firewall; managing the Windows or macOS firewall (Nautix cannot see it from a container); filtering by user identity (that is the IdP's job); deep packet inspection; rate limiting.

**Threat model.** A published port is reachable by whatever can route to the host address it is bound to. Mistakes this spec prevents: a database published on `0.0.0.0` of a public VPS; a DNS server answering the internet (amplification); an admin UI left open to a whole LAN. It does not defend against a compromised container or a compromised Docker socket (that is root on the host by design).

---

## A. Level 1 — Exposure

Every published port has an **exposure**, shown as a badge wherever ports are listed (container page, topology node, deploy dialog, Compose export):

| Exposure | Bind address | Badge |
|---|---|---|
| `local` | `127.0.0.1` | local only |
| `address` | one IP of the host (LAN or VPN), chosen from the host's interfaces | that IP |
| `open` | `0.0.0.0` / `::` | open (warning color) |

**Behavior**
- Default stays `local`. Choosing `open` asks for confirmation that lists the port, protocol and the container.
- Changing the exposure of an existing container recreates it (Docker cannot rebind a published port); the dialog says so and keeps name, env, mounts and networks. A failed recreate puts the old container back (same rule as fixed IPs, ADR-034).
- Host interfaces come from the engine (`info` + inspecting the host's bridge/ports); when they cannot be listed the dialog accepts a typed IPv4/IPv6 address, validated with `isIpAddress`.
- A list view "Exposure" (Resources → Containers filter and System → Security) groups every published port by exposure so an `open` port is never hidden.
- Templates keep their suggested host ports; the bind address is a separate field, never part of the port number.

**Contracts** (`packages/contracts/src/exposure.ts`)

```ts
export const Exposure = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('local') }),
  z.object({ kind: z.literal('address'), address: z.string().refine(isIpAddress) }),
  z.object({ kind: z.literal('open') }),
]);
export const exposureOf = (hostIp: string): Exposure["kind"] => /* "" | 0.0.0.0 | :: → open; 127.0.0.1 | ::1 → local; else address */
```

**Acceptance**
- The badge is derived from `HostIp` of the real port binding, so containers created outside Nautix show the truth.
- Unit tests for `exposureOf` (empty, v4, v6, loopback, LAN) and for the recreate-and-roll-back path (fake engine).
- Integration test on a real daemon: create with `local`, change to `address`, port answers only on that address.

---

## B. Level 2 — Gateway filters

The gateway adapters (Kong, nginx, Caddy, Traefik, HAProxy) gain one route field, `allow: string[]` (CIDRs; empty = no filter). Each adapter renders its native form:

| Adapter | Native mechanism |
|---|---|
| nginx | `allow <cidr>; deny all;` in the `location` |
| Caddy | `@ip remote_ip <cidrs>` matcher + `respond 403` |
| Traefik | `ipAllowList` middleware (`sourceRange`) |
| HAProxy | `acl allowed src <cidrs>` + `http-request deny` |
| Kong | `ip-restriction` plugin (`allow`) |

**Behavior**
- The route editor shows the field with the caller's current address as a one-click suggestion and a warning if the list does not contain it (lock-out guard).
- Behind another proxy the real client address is in `X-Forwarded-For`; each adapter documents which one it trusts, and the field is off by default for routes that sit behind a proxy Nautix does not manage.
- The strategy contract test (`gateway-contract.test.ts`) gains cases: CIDR validation, rendering, empty list renders nothing.

**Acceptance**: unit tests per adapter; integration test on a real nginx or Traefik: an address inside the list gets 200, one outside gets 403.

---

## C. Level 3 — Host firewall (optional helper)

### Rules

```ts
export const GuardRule = z.object({
  id: z.string().uuid(),
  container: ResourceName,          // stable across recreation, like DNS records
  port: z.number().int().min(1).max(65535),  // container port
  protocol: z.enum(['tcp', 'udp']),
  /** Sources allowed to connect. Never empty: an empty list would deny everyone. */
  allow: z.array(Cidr).min(1).max(64),
  note: z.string().max(200).optional(),
});
```

Stored in SQLite (`guard_rules`, migration v3), keyed by container name. A rule always means: *traffic to this published port is dropped unless the source is in `allow`*. Default for ports without a rule is unchanged (no filtering).

### Strategies

`GuardStrategy` (abstract class, like `GatewayStrategy` / `DnsStrategy`), one per backend, registry in `guard-strategies/index.ts`:

```ts
abstract class GuardStrategy {
  abstract readonly kind: 'iptables' | 'nftables';
  abstract plan(rules: ResolvedGuardRule[]): GuardPlan;   // pure: rules in, commands out
}
interface GuardPlan { apply: string[][]; remove: string[][]; check: string[][]; }
```

- `ResolvedGuardRule` has the published host port and protocol, resolved from the live container (rules follow the container when it is recreated).
- **iptables**: rules in the `DOCKER-USER` chain, one `NAUTIX-GUARD` sub-chain owned by Nautix (flushed and rebuilt on apply; nothing else is touched). Match on the original destination port (`-m conntrack --ctorigdstport`), since `DOCKER-USER` sees post-NAT traffic. First rule always accepts `ESTABLISHED,RELATED`.
- **nftables**: one table `inet nautix_guard` with a `forward` hook chain; the same semantics.
- Commands are argument arrays (never shell strings). The strategy is pure and unit-tested like the DNS ones.
- IPv6 is a second plan with the same rules and `ip6tables` / `inet`; a rule with only IPv4 sources drops all IPv6 to that port.

### The helper: `nautix-guard`

Nautix itself stays unprivileged, read-only, `no-new-privileges`. Applying rules is done by an **optional second container** that the user deploys from a template:

- `network_mode: host`, `cap_add: [NET_ADMIN]`, nothing else; no Docker socket.
- Talks to Nautix over a loopback-only channel: it polls `GET /api/v1/guard/plan` with a token created for it (shown once; stored hashed) and reports `POST /api/v1/guard/report`. Nautix never opens a connection into it.
- Applies the plan, reports the result and the backend it detected; re-applies on start and every 60 s (rules do not survive a host reboot, the helper restores them).
- Refuses to run if the backend is `firewalld`/`ufw`-managed in a way it cannot coexist with, and says why.

### Lock-out protection (mandatory)

1. A plan that would drop the address the request came from, or the Nautix port itself, is refused unless the user ticks an explicit "I understand".
2. **Trial window**: new or changed rules are applied with a 60-second timer; the UI shows a countdown and a "Keep" button. Without a confirmation the helper restores the previous rules by itself, even if the browser is gone.
3. "Disable all guards" is one button and one `DELETE /api/v1/guard/rules`, and the helper's `--panic` flag removes the `NAUTIX-GUARD` chain locally.

### UI

Resources → **Guards** tab (next to Gateways and DNS): helper status (connected / not deployed with a one-click template), the rules table, a form (container, port from its published ports, protocol, allowed sources with the caller's address suggested), and the trial countdown. Without the helper the tab explains what it is and links the template; it never silently does nothing.

### Acceptance
- Strategy unit tests (iptables, nftables, IPv4 + IPv6, established-first, empty-list refused).
- API e2e on the fake engine with a fake helper: rules CRUD, plan content, token flow, report, rollback on missing confirmation.
- Integration test on a real Linux daemon with the helper: a source inside `allow` connects, one outside times out, rollback after the trial window restores access.
- Not run in CI on platforms without iptables/nftables; documented as Linux-only.

---

## Cross-cutting

- Every string through i18n (en + es); colors from tokens; all dialogs keyboard accessible.
- Every change is audited (`guard.rule.create|update|delete`, `exposure.change`) with the previous value.
- `GET /api/v1/security/exposure` returns the exposure inventory used by the System view, so it can also be consumed by backups and the audit export.
- ADR per level when built. Level 3 is the only one that adds a privileged component; that decision gets its own ADR before any code.

## Open questions
- Docker Desktop and rootless Docker: the helper cannot reach their host firewall. Document as unsupported or add a mode that only reports the plan?
- Should `open` exposure on a server with a public address require the Level 2 or 3 guard (a hard rule) or only a warning?
- Rules by container port (what this spec uses) versus by host port: only matters when two containers publish the same container port.
