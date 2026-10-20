import { describe, expect, it } from "vitest";
import { formatEnv, parseEnv, randomizeSecrets, uniqueName } from "./deploy.js";

describe("deploy helpers", () => {
  it("round-trips env text and ignores comments", () => {
    const env = parseEnv("# c\nA=1\nB=x=y\n\nbad");
    expect(env).toEqual({ A: "1", B: "x=y" });
    expect(parseEnv(formatEnv(env))).toEqual(env);
  });

  it("replaces only placeholder secrets", () => {
    expect(randomizeSecrets({ P: "change-me", Q: "keep" }, () => "rnd")).toEqual({
      P: "rnd",
      Q: "keep",
    });
  });

  it("finds a free name", () => {
    expect(uniqueName("redis", ["redis", "redis-2"])).toBe("redis-3");
    expect(uniqueName("redis", [])).toBe("redis");
  });
});
