/** `.dockerignore` matching: `*`, `**`, `?`, `!` negation, leading "/" and trailing "/" (last match wins). */

interface Rule {
  re: RegExp;
  negate: boolean;
}

const toRegExp = (pattern: string): RegExp => {
  let out = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i] as string;
    if (c === "*") {
      if (pattern[i + 1] === "*") {
        i++;
        if (pattern[i + 1] === "/") {
          i++;
          out += "(?:.*/)?";
        } else out += ".*";
      } else out += "[^/]*";
    } else if (c === "?") out += "[^/]";
    else out += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${out}$`);
};

export const parseDockerignore = (text: string): Rule[] =>
  text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== "" && !l.startsWith("#"))
    .map((line) => {
      const negate = line.startsWith("!");
      const clean = (negate ? line.slice(1) : line).replace(/^\/+/, "").replace(/\/+$/, "");
      return { re: toRegExp(clean), negate };
    });

/** A file is ignored when it, or any parent directory, matches (and a later "!" rule did not undo it). */
export const isIgnored = (rules: Rule[], path: string): boolean => {
  const parts = path.split("/");
  let ignored = false;
  for (const rule of rules) {
    const hit = parts.some((_, i) => rule.re.test(parts.slice(0, i + 1).join("/")));
    if (hit) ignored = !rule.negate;
  }
  return ignored;
};
