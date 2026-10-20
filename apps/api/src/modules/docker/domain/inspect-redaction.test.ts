import { describe, expect, it } from "vitest";
import { redactInspect } from "./inspect-redaction.js";

describe("redactInspect", () => {
  it("hides env values but keeps names, without mutating the input", () => {
    const raw = { Name: "/db", Config: { Env: ["PASSWORD=s3cret", "A=b=c"] } };
    const out = redactInspect(raw) as typeof raw;
    expect(out.Config.Env).toEqual(["PASSWORD=<hidden>", "A=<hidden>"]);
    expect(raw.Config.Env[0]).toBe("PASSWORD=s3cret");
    expect(out.Name).toBe("/db");
  });

  it("passes through things without env", () => {
    expect(redactInspect(null)).toBeNull();
    expect(redactInspect({ Id: "x" })).toEqual({ Id: "x" });
  });
});
