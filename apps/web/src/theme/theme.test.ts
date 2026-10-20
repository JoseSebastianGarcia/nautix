import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolveTheme } from "./resolve-theme.js";

const css = readFileSync(new URL("./theme.css", import.meta.url), "utf8");
const tokens = (theme: string): string[] => {
  const block = css.split(`:root[data-theme="${theme}"]`)[1]?.split("}")[0] ?? "";
  return [...block.matchAll(/(--nx-[\w-]+):/g)].map((m) => m[1] ?? "").sort();
};

describe("theme", () => {
  it("dark and light define the same tokens", () => {
    expect(tokens("dark").length).toBeGreaterThan(10);
    expect(tokens("dark")).toEqual(tokens("light"));
  });

  it("resolves system choice from the OS preference", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
  });
});
