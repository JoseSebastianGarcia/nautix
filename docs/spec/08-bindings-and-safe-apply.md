# 08 — Bindings and safe apply

Two features that make Nautix feel like a platform instead of a Docker client, built in this order because the second one is how the first one is applied.

1. **Safe apply**: any change that needs a container to be recreated (new environment, new ports, new network) goes through one mechanism with a **health gate** and **automatic rollback**.
2. **Bindings**: drag a line from an app to a service it uses (a database, a cache, an identity provider) and Nautix wires the network, the name and the connection settings, then applies it safely.

**Non-goals.** A new configuration language, orchestration across hosts, secrets management beyond what the container already holds (a binding copies what the provider's own settings say; a vault integration is a later adapter).

---

## A. Safe apply

### Behavior

`recreate(container, change, gate)` generalises what port exposure already does (ADR-039):

1. Build the new container from the old one's inspected settings plus the change (`planRecreate`, pure).
2. Stop the old one, park it under a temporary name, create and start the new one.
3. **Gate**: wait for the new container to prove it works.
   - It has a `HEALTHCHECK`: wait for `healthy` (fail on `unhealthy`, or when it is still `starting` after `timeoutSeconds`).
   - It has none: it must stay running, with no restart, for `settleSeconds`.
4. Passed → remove the parked container. Failed, or any error earlier → remove the new one, rename the old one back, start it again, and report why (`errors.applyUnhealthy` with the last log lines).
5. A container that was stopped is recreated stopped and the gate is skipped.

Defaults: `settleSeconds` 5, `timeoutSeconds` 60. Both can be given per call, within limits (1–30, 5–600).

### Change

```ts
interface ContainerChange {
  ports?: PortRebind[];                       // host address of published ports
  env?: Record<string, string | null>;        // value = set, null = remove
  joinNetworks?: string[];                    // networks to be on in addition to its own
}
```

### API

- `PUT /containers/:id/env` `{ set?: Record<string,string>, unset?: string[] }`: edit the environment of a container (new capability: today the only way is to delete and redeploy). Secrets are never returned; the response lists the keys changed.
- Existing `PUT /containers/:id/exposure` moves onto the same mechanism and gains the gate.
- Nautix itself cannot be recreated from the UI (self guard, as today).

### UI

Every dialog that recreates says so before confirming ("this recreates the container; if it does not become healthy in N seconds the previous one is put back") and shows the result: applied, or rolled back with the reason and the last log lines.

### Acceptance

- Unit: `planRecreate` for ports, env set/unset, joining a network, anonymous volumes kept (the existing `planRebind` cases still pass).
- Real daemon: a change that makes the process exit is rolled back (old container, old id, same data, same address); a change that keeps it healthy is applied; a container with a `HEALTHCHECK` is gated on it.
- e2e (fake engine): env edit applied; failing change reports rollback and leaves the container as it was.

---

## B. Bindings

### Model

```ts
interface Binding {
  id: string;
  consumer: string;      // container that uses the service (by name)
  provider: string;      // container that offers it
  kind: BindingKind;     // chosen from the provider's image: postgres | mysql | mariadb | redis | mongodb | sqlserver | rabbitmq | http
  name: string;          // used to name the settings, default = provider name
  style: "dotnet" | "url";
}
```

A binding is stored by container *name* (stable across recreation), in SQLite (`bindings`, migration 4).

### What applying a binding does

1. **Network**: the consumer joins a network the provider is on (a shared one if there is one; otherwise it joins the provider's first user-defined network). Never the default bridge.
2. **Name**: the provider is reachable by its container name on that network (Docker DNS), so no address is hard-coded.
3. **Settings**: a `BindingStrategy` per kind turns what the provider's own environment says (user, password, database, port) into the consumer's environment:
   - `dotnet`: `ConnectionStrings__<Name>=Host=db;Port=5432;Database=app;Username=app;Password=…` (SQL Server, MySQL, Redis, MongoDB, RabbitMQ each in their provider's format);
   - `url`: `<NAME>_URL=postgres://app:…@db:5432/app`.
4. The consumer is recreated through **safe apply** with those variables; the binding is kept only if the apply succeeds.

Removing a binding unsets exactly the variables it added (it records their names) and applies safely too.

### Rules

- Values come from the provider's current environment at apply time, so a changed password is picked up by re-applying; the binding stores no secret.
- The dialog shows the variable names and masks the values; it states plainly that the password ends up in the consumer's environment (visible to anyone who can inspect it).
- A provider with no recognisable settings (unknown image) is bound as `http`: network + `<NAME>_URL=http://provider:port`.
- A consumer cannot be bound to itself; Nautix itself cannot be a consumer or provider.
- Adding a second binding of the same `name` to a consumer is refused (the variable would be overwritten).

### API

- `GET /bindings`.
- `POST /bindings/plan` `{ consumer, provider, name?, style? }` → `{ kind, network, variables: [{ key, masked }], recreates: true }`.
- `POST /bindings` same body → applies safely; returns the binding or the rollback reason.
- `POST /bindings/:id/apply` re-applies (provider's settings changed).
- `DELETE /bindings/:id`.

### UI

In the topology, container nodes get a connection handle. Dragging from an app to a service opens the binding dialog with the plan (kind, network, variables with masked values, the recreate warning). Bindings are drawn as their own kind of line (solid, labelled with the kind) and listed in the inspector of both containers, with Re-apply and Remove.

### Acceptance

- Unit: strategies per kind (dotnet and url output, special characters in passwords are escaped), network choice, variable bookkeeping.
- e2e: plan, create, list, duplicate refused, re-apply, delete; consumer's environment contains and then no longer contains the variables; failed apply leaves no binding.
- Real daemon: a Postgres provider and a consumer; after binding, the consumer connects by the generated settings (name resolves, credentials work).

---

## Order of work

1. `planRecreate` + `DockerEngine.recreateContainer` with the gate; exposure moves onto it; env editing; tests (unit, real daemon, e2e).
2. Bindings: contracts, strategies, module, API, tests.
3. UI: result display for recreating dialogs, env editor, topology handle and dialog, inspector list.
