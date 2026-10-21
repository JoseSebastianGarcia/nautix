import type { GuardBackend, GuardCommandStep, ResolvedGuardRule } from "@nautix/contracts";

export type GuardStep = GuardCommandStep;

export interface GuardPlan {
  apply: GuardStep[];
  /** Takes every Nautix rule out of the firewall again. */
  remove: GuardStep[];
}

/**
 * Strategy: one implementation per firewall backend. The plan is pure data, so it is unit-tested
 * without a firewall and shown to the user before anything runs.
 */
export abstract class GuardStrategy {
  abstract readonly kind: GuardBackend;
  abstract plan(rules: ResolvedGuardRule[]): GuardPlan;
}

/** Entries of `allow` that belong to one IP family. */
export const ofFamily = (allow: string[], family: 4 | 6): string[] =>
  allow.filter((c) => (c.includes(":") ? 6 : 4) === family);
