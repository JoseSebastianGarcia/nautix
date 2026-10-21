import { describe, expect, it } from "vitest";
import { judgeGate } from "./health-gate.js";
import { DEFAULT_GATE } from "./recreate.js";

const gate = { settleSeconds: 5, timeoutSeconds: 60 };

describe("judgeGate", () => {
  it("without a health check passes only after it stayed up for the settle time", () => {
    expect(judgeGate({ Running: true }, 1000, gate)).toEqual({ verdict: "wait" });
    expect(judgeGate({ Running: true }, 5000, gate)).toEqual({ verdict: "pass" });
  });

  it("fails as soon as the container is down or restarting, whatever the clock says", () => {
    expect(judgeGate({ Running: false, ExitCode: 3 }, 100, gate)).toEqual({
      verdict: "fail",
      reason: "it exited (code 3)",
    });
    expect(judgeGate({ Running: true, Restarting: true }, 100, gate).verdict).toBe("fail");
    expect(judgeGate({ Running: true, RestartCount: 1 }, 100, gate)).toEqual({
      verdict: "fail",
      reason: "it keeps restarting",
    });
  });

  it("with a health check waits for healthy, fails on unhealthy and on timeout", () => {
    const sample = (status: string) => ({ Running: true, Health: { Status: status } });
    expect(judgeGate(sample("starting"), 10_000, gate)).toEqual({ verdict: "wait" });
    expect(judgeGate(sample("healthy"), 100, gate)).toEqual({ verdict: "pass" });
    expect(judgeGate(sample("unhealthy"), 100, gate).verdict).toBe("fail");
    expect(judgeGate(sample("starting"), 60_000, gate)).toEqual({
      verdict: "fail",
      reason: "it was not healthy after 60 s",
    });
  });

  it("treats Docker's `none` health status as no health check", () => {
    expect(judgeGate({ Running: true, Health: { Status: "none" } }, 5000, gate)).toEqual({
      verdict: "pass",
    });
  });

  it("has sensible defaults", () => {
    expect(DEFAULT_GATE).toEqual({ settleSeconds: 5, timeoutSeconds: 60 });
  });
});
