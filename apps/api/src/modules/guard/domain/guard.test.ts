import type { GuardRule, ResolvedGuardRule } from "@nautix/contracts";
import { describe, expect, it } from "vitest";
import {
  confirmPending,
  disableAll,
  EMPTY_STATE,
  helperConnected,
  planDoc,
  settle,
  withRules,
} from "./guard-state.js";
import { resolveGuardRules } from "./resolve-rules.js";
import { buildIptablesRestore, IptablesStrategy } from "./strategies/iptables.strategy.js";
import { buildNftScript, NftablesStrategy } from "./strategies/nftables.strategy.js";

const db: ResolvedGuardRule = {
  hostPort: 5432,
  protocol: "tcp",
  allow: ["10.0.0.0/24", "192.168.1.5", "fd00::/8"],
};
const dns: ResolvedGuardRule = { hostPort: 53, protocol: "udp", allow: ["127.0.0.1"] };

describe("iptables strategy", () => {
  it("renders the chain per IP family, matching the original destination port", () => {
    const v4 = buildIptablesRestore([db, dns], 4);
    expect(v4).toContain(":NAUTIX-GUARD - [0:0]");
    expect(v4.indexOf("ESTABLISHED,RELATED")).toBeLessThan(v4.indexOf("--ctorigdstport 5432"));
    expect(v4).toContain(
      "-A NAUTIX-GUARD -p tcp -m conntrack --ctorigdstport 5432 --ctdir ORIGINAL -s 10.0.0.0/24 -j RETURN",
    );
    expect(v4).toContain("--ctorigdstport 5432 --ctdir ORIGINAL -j DROP");
    expect(v4).not.toContain("fd00::/8");
    expect(v4.trim().endsWith("COMMIT")).toBe(true);
  });

  it("drops a whole family for a port that lists no address of it", () => {
    const v6 = buildIptablesRestore([db, dns], 6);
    expect(v6).toContain("-s fd00::/8 -j RETURN");
    // the DNS rule only allows an IPv4 address, so every IPv6 packet to port 53 is dropped
    expect(v6).toMatch(/--ctorigdstport 53 --ctdir ORIGINAL -j DROP/);
    expect(v6).not.toMatch(/-s 127\.0\.0\.1.*53/);
  });

  it("jumps to the chain from DOCKER-USER once, and removes everything cleanly", () => {
    const plan = new IptablesStrategy().plan([db]);
    const jump = plan.apply.find((s) => s.argv.includes("-I"));
    expect(jump?.argv).toEqual(["iptables", "-I", "DOCKER-USER", "1", "-j", "NAUTIX-GUARD"]);
    expect(jump?.unless).toEqual(["iptables", "-C", "DOCKER-USER", "-j", "NAUTIX-GUARD"]);
    expect(plan.apply.some((s) => s.argv[0] === "ip6tables-restore")).toBe(true);
    expect(plan.remove.map((s) => s.argv.slice(0, 2).join(" "))).toEqual([
      "iptables -D",
      "iptables -F",
      "iptables -X",
      "ip6tables -D",
      "ip6tables -F",
      "ip6tables -X",
    ]);
    expect(plan.remove.every((s) => s.tolerateFailure)).toBe(true);
  });
});

describe("nftables strategy", () => {
  it("replaces one table atomically with a forward hook before Docker's chains", () => {
    const script = buildNftScript([db, dns]);
    expect(script).toContain("add table inet nautix_guard\ndelete table inet nautix_guard");
    expect(script).toContain("hook forward priority -1");
    expect(script).toContain("ct state established,related accept");
    expect(script).toContain(
      "meta nfproto ipv4 meta l4proto tcp ct original proto-dst 5432 ip saddr != { 10.0.0.0/24, 192.168.1.5 } drop",
    );
    expect(script).toContain(
      "meta nfproto ipv6 meta l4proto tcp ct original proto-dst 5432 ip6 saddr != { fd00::/8 } drop",
    );
    // no IPv6 source listed for DNS: all IPv6 to that port is dropped
    expect(script).toContain("meta nfproto ipv6 meta l4proto udp ct original proto-dst 53 drop");
    const plan = new NftablesStrategy().plan([db]);
    expect(plan.apply).toHaveLength(1);
    expect(plan.apply[0]?.argv).toEqual(["nft", "-f", "/tmp/nautix-guard.nft"]);
    expect(plan.apply[0]?.file?.content).toBe(buildNftScript([db]));
    expect(plan.remove[0]?.argv).toEqual(["nft", "delete", "table", "inet", "nautix_guard"]);
  });
});

const rule = (over: Partial<GuardRule> = {}): GuardRule => ({
  container: "db",
  port: 5432,
  protocol: "tcp",
  allow: ["10.0.0.0/24"],
  ...over,
});

describe("resolveGuardRules", () => {
  const containers = [
    {
      name: "db",
      state: "running",
      ports: [{ ip: "0.0.0.0", privatePort: 5432, publicPort: 15432, type: "tcp" }],
    },
    { name: "idle", state: "exited", ports: [{ privatePort: 80, type: "tcp" }] },
  ];
  it("finds the host port Docker published and reports what it cannot enforce", () => {
    const out = resolveGuardRules(
      [rule(), rule({ container: "idle", port: 80 }), rule({ container: "gone" })],
      containers,
    );
    expect(out.resolved).toEqual([{ hostPort: 15432, protocol: "tcp", allow: ["10.0.0.0/24"] }]);
    expect(out.unresolved.map((r) => r.container)).toEqual(["idle", "gone"]);
  });
  it("does not mix protocols", () => {
    expect(resolveGuardRules([rule({ protocol: "udp" })], containers).resolved).toEqual([]);
  });
});

describe("trial", () => {
  const T0 = 1_000_000;
  it("keeps the confirmed rules until a change is confirmed and rolls back when it runs out", () => {
    const confirmed = withRules(EMPTY_STATE, [rule()], T0, false);
    expect(confirmed.confirmed).toHaveLength(1);
    expect(confirmed.pending).toBeNull();

    const trial = withRules(confirmed, [rule({ allow: ["1.2.3.4"] })], T0, true);
    expect(trial.confirmed[0]?.allow).toEqual(["10.0.0.0/24"]);
    expect(trial.pending?.deadline).toBe(T0 + 60_000);
    expect(trial.revision).toBeGreaterThan(confirmed.revision);

    const containers = [
      {
        name: "db",
        state: "running",
        ports: [{ privatePort: 5432, publicPort: 5432, type: "tcp" }],
      },
    ];
    const doc = planDoc(trial, containers);
    expect(doc.rules[0]?.allow).toEqual(["1.2.3.4"]);
    expect(doc.fallback?.[0]?.allow).toEqual(["10.0.0.0/24"]);
    expect(doc.validUntil).toBe(new Date(T0 + 60_000).toISOString());

    expect(settle(trial, T0 + 59_000).pending).not.toBeNull();
    const back = settle(trial, T0 + 60_000);
    expect(back.pending).toBeNull();
    expect(back.revision).toBeGreaterThan(trial.revision);
    expect(planDoc(back, containers).rules[0]?.allow).toEqual(["10.0.0.0/24"]);

    const kept = confirmPending(trial);
    expect(kept.confirmed[0]?.allow).toEqual(["1.2.3.4"]);
    expect(kept.pending).toBeNull();
  });

  it("disabling clears both and the helper counts as connected only while it polls", () => {
    const state = withRules(withRules(EMPTY_STATE, [rule()], 0, false), [rule()], 0, true);
    const off = disableAll(state);
    expect(off.confirmed).toEqual([]);
    expect(off.pending).toBeNull();
    expect(helperConnected({ ...EMPTY_STATE, seenAt: 100_000 }, 110_000)).toBe(true);
    expect(helperConnected({ ...EMPTY_STATE, seenAt: 100_000 }, 131_000)).toBe(false);
    expect(helperConnected(EMPTY_STATE, 0)).toBe(false);
  });
});
