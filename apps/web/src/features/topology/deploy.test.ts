import { TEMPLATES } from "@nautix/contracts";
import { describe, expect, it } from "vitest";
import {
  formatEnv,
  joinCommand,
  namedVolumes,
  parseEnv,
  randomizeSecrets,
  randomSecret,
  splitCommand,
  uniqueName,
} from "./deploy.js";

describe("joinCommand", () => {
  it("round-trips every template command through the deploy dialog's text field", () => {
    const withCommand = TEMPLATES.filter((t) => t.command);
    expect(withCommand.length).toBeGreaterThan(0);
    for (const t of withCommand)
      expect(splitCommand(joinCommand(t.command ?? []))).toEqual(t.command);
  });

  it("quotes only what needs it", () => {
    expect(joinCommand(["a", "b c", "", 'd"e'])).toBe(`a "b c" "" 'd"e'`);
  });
});

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

  it("turns data paths into named volumes", () => {
    expect(namedVolumes("db", ["/var/lib/data", "/etc/x"])).toEqual([
      "db-data:/var/lib/data",
      "db-data-2:/etc/x",
    ]);
  });

  it("generates secrets that satisfy common password policies", () => {
    for (let i = 0; i < 200; i++) {
      const secret = randomSecret();
      expect(secret).toHaveLength(24);
      expect(secret).toMatch(/[A-Z]/);
      expect(secret).toMatch(/[a-z]/);
      expect(secret).toMatch(/[0-9]/);
      expect(secret).toMatch(/^[A-Za-z0-9]+$/);
    }
  });

  it("splits commands with quotes and no shell", () => {
    expect(splitCommand("--a=1  --b 'two words' \"x y\"")).toEqual([
      "--a=1",
      "--b",
      "two words",
      "x y",
    ]);
    expect(splitCommand("")).toEqual([]);
    expect(splitCommand("sh -c ''")).toEqual(["sh", "-c", ""]);
  });
});
