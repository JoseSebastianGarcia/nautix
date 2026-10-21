import type { GuardPlanDoc, GuardReport, ResolvedGuardRule } from "@nautix/contracts";
import { describe, expect, it } from "vitest";
import { detectBackend, type Executor, GuardHelper, runSteps } from "./helper-runner.js";

const rule: ResolvedGuardRule = { hostPort: 5432, protocol: "tcp", allow: ["10.0.0.0/24"] };

const fakes = (failOn?: string) => {
  const calls: string[] = [];
  const exec: Executor = {
    async write(path, content) {
      calls.push(`write ${path} ${content.length}`);
    },
    async run(argv, stdin) {
      const line = argv.join(" ");
      calls.push(stdin ? `${line} <stdin>` : line);
      // `iptables -C` fails: the jump is not there yet
      if (argv[1] === "-C") return { code: 1, output: "" };
      return failOn && line.includes(failOn)
        ? { code: 1, output: "boom" }
        : { code: 0, output: "" };
    },
  };
  return { calls, exec };
};

const harness = (docs: (GuardPlanDoc | Error)[], failOn?: string) => {
  const { calls, exec } = fakes(failOn);
  const reports: GuardReport[] = [];
  let now = 0;
  let i = 0;
  const helper = new GuardHelper("iptables", {
    exec,
    now: () => now,
    fetchPlan: async () => {
      const doc = docs[Math.min(i++, docs.length - 1)];
      if (!doc || doc instanceof Error) throw doc ?? new Error("none");
      return doc;
    },
    report: async (r) => {
      reports.push(r);
    },
  });
  return { helper, calls, reports, setNow: (t: number) => (now = t) };
};

const doc = (over: Partial<GuardPlanDoc> = {}): GuardPlanDoc => ({
  revision: 1,
  rules: [rule],
  fallback: null,
  validUntil: null,
  ...over,
});

describe("runSteps", () => {
  it("skips a step whose `unless` check passes, tolerates marked failures, stops on the others", async () => {
    const calls: string[] = [];
    const exec: Executor = {
      async write() {},
      async run(argv) {
        calls.push(argv.join(" "));
        return { code: argv[0] === "bad" ? 1 : 0, output: "nope" };
      },
    };
    const ok = await runSteps(
      [
        { argv: ["a"], unless: ["check"] },
        { argv: ["bad"], tolerateFailure: true },
        { argv: ["b"] },
      ],
      exec,
    );
    expect(ok.ok).toBe(true);
    expect(calls).toEqual(["check", "bad", "b"]);
    const failed = await runSteps([{ argv: ["bad", "x"] }, { argv: ["never"] }], exec);
    expect(failed).toEqual({ ok: false, error: "bad x: nope" });
    expect(calls).not.toContain("never");
  });
});

describe("GuardHelper", () => {
  it("applies the plan once, reports it, and does nothing while it stays the same", async () => {
    const h = harness([doc()]);
    await h.helper.tick();
    await h.helper.tick();
    expect(h.calls.filter((c) => c.startsWith("iptables-restore"))).toHaveLength(1);
    expect(h.reports).toEqual([{ revision: 1, backend: "iptables", ok: true }]);
  });

  it("re-applies when the rules change and removes the chain when they are all gone", async () => {
    const h = harness([
      doc(),
      doc({ revision: 2, rules: [{ ...rule, allow: ["1.1.1.1"] }] }),
      doc({ revision: 3, rules: [] }),
    ]);
    await h.helper.tick();
    await h.helper.tick();
    expect(h.calls.filter((c) => c.startsWith("iptables-restore"))).toHaveLength(2);
    await h.helper.tick();
    expect(h.calls.at(-1)).toContain("-X NAUTIX-GUARD");
  });

  it("reports a failing command and retries on the next poll", async () => {
    const h = harness([doc()], "iptables-restore");
    await h.helper.tick();
    await h.helper.tick();
    expect(h.reports).toHaveLength(1);
    expect(h.reports[0]).toMatchObject({ ok: false });
    expect(h.reports[0]?.error).toContain("iptables-restore -n: boom");
    expect(h.calls.filter((c) => c.startsWith("iptables-restore"))).toHaveLength(2);
  });

  it("undoes an unconfirmed trial by itself when Nautix cannot be reached", async () => {
    const fallback: ResolvedGuardRule[] = [{ ...rule, allow: ["192.168.0.0/16"] }];
    const trial = doc({
      revision: 5,
      rules: [rule],
      fallback,
      validUntil: new Date(60_000).toISOString(),
    });
    const h = harness([trial, new Error("down")]);
    await h.helper.tick();
    h.setNow(30_000);
    await h.helper.tick();
    expect(h.calls.filter((c) => c.startsWith("iptables-restore"))).toHaveLength(1);
    h.setNow(61_000);
    await h.helper.tick();
    await h.helper.tick();
    const restores = h.calls.filter((c) => c.startsWith("iptables-restore"));
    expect(restores).toHaveLength(2); // the fallback, applied once
  });

  it("removeAll takes the chain out", async () => {
    const h = harness([doc()]);
    const result = await h.helper.removeAll();
    expect(result.ok).toBe(true);
    expect(h.calls).toContain("iptables -X NAUTIX-GUARD");
    expect(h.calls).toContain("ip6tables -X NAUTIX-GUARD");
  });
});

describe("detectBackend", () => {
  it("prefers iptables, falls back to nft, and gives up", async () => {
    const answer = (works: string[]): Executor => ({
      async write() {},
      async run(argv) {
        return { code: works.includes(argv[0] ?? "") ? 0 : 127, output: "" };
      },
    });
    expect(await detectBackend(answer(["iptables", "nft"]))).toBe("iptables");
    expect(await detectBackend(answer(["nft"]))).toBe("nftables");
    expect(await detectBackend(answer([]))).toBeNull();
  });
});
