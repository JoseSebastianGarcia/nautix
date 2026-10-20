import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL("..", import.meta.url));
const WEB = fileURLToPath(new URL("../../../web/src/i18n/", import.meta.url));

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory()
      ? files(path)
      : path.endsWith(".ts") && !path.endsWith(".test.ts")
        ? [path]
        : [];
  });

describe("error hints", () => {
  it("every `errors.*` hint the API can send has an English and a Spanish text", () => {
    const hints = new Set<string>();
    for (const file of files(SRC))
      for (const m of readFileSync(file, "utf8").matchAll(/"errors\.([A-Za-z]+)"/g))
        hints.add(m[1] as string);
    // hints built at run time from a fixed list of reasons
    for (const reason of ["invalid", "noSubnet", "outsideSubnet", "reserved", "gateway"])
      hints.add(`fixedIp_${reason}`);
    expect(hints.size).toBeGreaterThan(20);
    for (const lang of ["en", "es"]) {
      const errors = (
        JSON.parse(readFileSync(join(WEB, `${lang}.json`), "utf8")) as {
          errors: Record<string, string>;
        }
      ).errors;
      expect([...hints].filter((h) => !(h in errors)).sort(), `missing in ${lang}.json`).toEqual(
        [],
      );
    }
  });
});
