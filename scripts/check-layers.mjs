// Onion rule: domain <- application <- infrastructure/presentation. Inner layers never import outer ones.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, sep } from "node:path";

const root = "apps/api/src/modules";
const forbiddenForInner = [
  /\/infrastructure\//,
  /\/presentation\//,
  /from "(node:(fs|net|child_process|http|https)|better-sqlite3|express|undici)"/,
];
const forbiddenForDomain = [/\/application\//];
const errors = [];

const walk = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".ts") ? [p] : [];
  });

for (const file of walk(root)) {
  const layer = file
    .split(sep)
    .find((s) => ["domain", "application", "infrastructure", "presentation"].includes(s));
  if (layer !== "domain" && layer !== "application") continue;
  const imports = readFileSync(file, "utf8")
    .split("\n")
    .filter((l) => /^\s*(import|export) .* from /.test(l));
  const rules =
    layer === "domain" ? [...forbiddenForInner, ...forbiddenForDomain] : forbiddenForInner;
  for (const line of imports) {
    if (rules.some((r) => r.test(line)))
      errors.push(`${file}: ${layer} must not import -> ${line.trim()}`);
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("layer rules ok");
