import type { RecreateGate } from "./recreate.js";

/** The slice of a container's `State` (and its restart count) that the gate looks at. */
export interface GateSample {
  Running: boolean;
  Restarting?: boolean;
  ExitCode?: number;
  Health?: { Status?: string };
  RestartCount?: number;
}

export type GateVerdict =
  | { verdict: "pass" }
  | { verdict: "wait" }
  | { verdict: "fail"; reason: string };

/**
 * Decides whether a freshly started container has proven itself. With a HEALTHCHECK it must become
 * healthy; without one it must simply stay up, without restarting, for `settleSeconds`.
 */
export const judgeGate = (
  sample: GateSample,
  elapsedMs: number,
  gate: RecreateGate,
): GateVerdict => {
  if (!sample.Running || sample.Restarting)
    return { verdict: "fail", reason: `it exited (code ${sample.ExitCode ?? "?"})` };
  if ((sample.RestartCount ?? 0) > 0) return { verdict: "fail", reason: "it keeps restarting" };
  const health = sample.Health?.Status;
  if (health && health !== "none") {
    if (health === "healthy") return { verdict: "pass" };
    if (health === "unhealthy") return { verdict: "fail", reason: "its health check fails" };
    return elapsedMs >= gate.timeoutSeconds * 1000
      ? { verdict: "fail", reason: `it was not healthy after ${gate.timeoutSeconds} s` }
      : { verdict: "wait" };
  }
  return elapsedMs >= gate.settleSeconds * 1000 ? { verdict: "pass" } : { verdict: "wait" };
};
