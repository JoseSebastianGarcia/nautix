import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import en from "./en.json";
import es from "./es.json";

const flatten = (obj: Record<string, unknown>, prefix = ""): Record<string, string> =>
  Object.entries(obj).reduce<Record<string, string>>((acc, [k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    return typeof v === "string"
      ? { ...acc, [key]: v }
      : { ...acc, ...flatten(v as Record<string, unknown>, key) };
  }, {});

const placeholders = (s: string): string[] =>
  [...s.matchAll(/{{\s*(\w+)\s*}}/g)].map((m) => m[1] ?? "").sort();

describe("i18n parity", () => {
  const a = flatten(en);
  const b = flatten(es);

  it("has the same keys in en and es", () => {
    expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort());
  });

  it("uses the same placeholders", () => {
    for (const key of Object.keys(a))
      expect(placeholders(b[key] ?? "")).toEqual(placeholders(a[key] ?? ""));
  });

  it("every t('key') used in source exists", () => {
    const used = new Set<string>();
    const walk = (dir: string): void => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(p) && !p.endsWith(".test.ts")) {
          for (const m of readFileSync(p, "utf8").matchAll(/\bt\(\s*["'`]([\w.]+)["'`]/g))
            used.add(m[1] ?? "");
        }
      }
    };
    walk(new URL("..", import.meta.url).pathname);
    const missing = [...used].filter(
      (k) => !(k in a) && !Object.keys(a).some((x) => x.startsWith(`${k}.`)),
    );
    expect(missing).toEqual([]);
  });
});
