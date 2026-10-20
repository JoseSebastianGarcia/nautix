// Fails when an installed dependency is under a license the project does not accept (GPL, AGPL, SSPL, BUSL).
// Allowed: MIT, Apache-2.0, BSD, ISC, MPL and similar permissive licenses. See CLAUDE.md rule 8.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const store = join(process.cwd(), "node_modules", ".pnpm");
if (!existsSync(store)) {
  console.error("run pnpm install first");
  process.exit(1);
}

const FORBIDDEN = /\b(A?GPL|SSPL|BUSL|BSL-1\.1|Commons-Clause)\b/i;
// Dual-licensed packages are fine when at least one choice is acceptable.
const bad = [];
let checked = 0;

const licenseOf = (pkg) => {
  const l = pkg.license ?? pkg.licenses;
  if (!l) return "";
  if (typeof l === "string") return l;
  if (Array.isArray(l)) return l.map((x) => (typeof x === "string" ? x : x.type)).join(" OR ");
  return l.type ?? "";
};

for (const entry of readdirSync(store)) {
  const modules = join(store, entry, "node_modules");
  if (!existsSync(modules)) continue;
  for (const name of readdirSync(modules)) {
    const dirs = name.startsWith("@")
      ? readdirSync(join(modules, name)).map((n) => join(modules, name, n))
      : [join(modules, name)];
    for (const dir of dirs) {
      const file = join(dir, "package.json");
      if (!existsSync(file)) continue;
      let pkg;
      try {
        pkg = JSON.parse(readFileSync(file, "utf8"));
      } catch {
        continue;
      }
      if (pkg.name?.startsWith("@nautix/")) continue;
      checked++;
      const license = licenseOf(pkg);
      const choices = license.split(/\s+OR\s+|\s*\/\s*/i).map((s) => s.replace(/[()]/g, "").trim());
      const allForbidden = choices.length > 0 && license !== "" && choices.every((c) => FORBIDDEN.test(c));
      if (allForbidden) bad.push(`${pkg.name}@${pkg.version}: ${license}`);
    }
  }
}

if (bad.length) {
  console.error(`forbidden licenses:\n${[...new Set(bad)].join("\n")}`);
  process.exit(1);
}
console.log(`license check ok (${checked} packages)`);
