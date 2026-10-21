import type { GuardBackend, GuardPlanDoc, GuardReport, ResolvedGuardRule } from "@nautix/contracts";
import type { GuardStep } from "../domain/guard-strategy.js";
import { guardStrategyFor } from "../domain/strategies/index.js";

export interface Executor {
  run(argv: string[], stdin?: string): Promise<{ code: number; output: string }>;
  write(path: string, content: string): Promise<void>;
}

export interface StepResult {
  ok: boolean;
  error?: string;
}

/** Runs a plan's steps in order; stops at the first failure that is not tolerated. */
export const runSteps = async (steps: GuardStep[], exec: Executor): Promise<StepResult> => {
  for (const step of steps) {
    if (step.unless && (await exec.run(step.unless)).code === 0) continue;
    if (step.file) await exec.write(step.file.path, step.file.content);
    const result = await exec.run(step.argv, step.stdin);
    if (result.code !== 0 && !step.tolerateFailure)
      return { ok: false, error: `${step.argv.join(" ")}: ${result.output.trim().slice(0, 500)}` };
  }
  return { ok: true };
};

/** The first firewall front end that answers: iptables, else nft. */
export const detectBackend = async (exec: Executor): Promise<GuardBackend | null> => {
  const tries: [GuardBackend, string[]][] = [
    ["iptables", ["iptables", "-V"]],
    ["nftables", ["nft", "--version"]],
  ];
  for (const [backend, argv] of tries) {
    const result = await exec.run(argv).catch(() => ({ code: 1, output: "" }));
    if (result.code === 0) return backend;
  }
  return null;
};

export interface HelperIo {
  fetchPlan(): Promise<GuardPlanDoc>;
  report(report: GuardReport): Promise<void>;
  exec: Executor;
  now(): number;
}

/**
 * The privileged half of port guards. It only applies what Nautix tells it: poll the plan, apply it
 * when it changed, report the outcome. If Nautix cannot be reached and a trial has run out, it
 * applies the fallback rules itself, so a bad change never outlives its trial.
 */
export class GuardHelper {
  private last: GuardPlanDoc | null = null;
  private appliedKey: string | null = null;
  private reportedKey: string | null = null;
  private fellBack = false;

  constructor(
    private readonly backend: GuardBackend,
    private readonly io: HelperIo,
  ) {}

  async tick(): Promise<void> {
    let doc: GuardPlanDoc;
    try {
      doc = await this.io.fetchPlan();
    } catch {
      await this.maybeFallBack();
      return;
    }
    this.last = doc;
    this.fellBack = false;
    await this.enforce(doc.revision, doc.rules);
  }

  /** Removes every Nautix rule from the firewall (the `--panic` switch). */
  async removeAll(): Promise<StepResult> {
    return runSteps(guardStrategyFor(this.backend).plan([]).remove, this.io.exec);
  }

  private async maybeFallBack(): Promise<void> {
    const doc = this.last;
    if (!doc?.validUntil || !doc.fallback || this.fellBack) return;
    if (this.io.now() <= Date.parse(doc.validUntil)) return;
    this.fellBack = true;
    await this.enforce(doc.revision, doc.fallback, "fallback");
  }

  private async enforce(revision: number, rules: ResolvedGuardRule[], tag = "plan"): Promise<void> {
    const key = `${tag}:${JSON.stringify(rules)}`;
    if (key === this.appliedKey) return;
    const plan = guardStrategyFor(this.backend).plan(rules);
    // No rules at all: take the chain out instead of leaving an empty one behind.
    const result = await runSteps(rules.length === 0 ? plan.remove : plan.apply, this.io.exec);
    if (result.ok) this.appliedKey = key;
    const reportKey = `${revision}:${key}:${result.ok}:${result.error ?? ""}`;
    if (reportKey === this.reportedKey) return;
    this.reportedKey = reportKey;
    await this.io
      .report({
        revision,
        backend: this.backend,
        ok: result.ok,
        ...(result.error ? { error: result.error } : {}),
      })
      .catch(() => undefined);
  }
}
