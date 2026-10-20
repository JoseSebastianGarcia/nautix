export const parseEnv = (text: string): Record<string, string> => {
  const env: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1);
  }
  return env;
};

export const formatEnv = (env: Record<string, string>): string =>
  Object.entries(env)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

/** Template placeholder secrets are replaced by random values so nothing ships with "change-me". */
export const randomizeSecrets = (
  env: Record<string, string>,
  random: () => string,
): Record<string, string> =>
  Object.fromEntries(Object.entries(env).map(([k, v]) => [k, v === "change-me" ? random() : v]));

const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnopqrstuvwxyz";
const DIGIT = "23456789";

/**
 * 24-character secret that always has upper case, lower case and digits, so it passes password
 * policies such as SQL Server's, and avoids look-alike characters and anything needing quoting.
 */
export const randomSecret = (): string => {
  const alphabet = UPPER + LOWER + DIGIT;
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const chars = [...bytes].map((b) => alphabet[b % alphabet.length] as string);
  chars[0] = UPPER[(bytes[0] ?? 0) % UPPER.length] as string;
  chars[1] = LOWER[(bytes[1] ?? 0) % LOWER.length] as string;
  chars[2] = DIGIT[(bytes[2] ?? 0) % DIGIT.length] as string;
  return chars.join("");
};

/** First free name: base, base-2, base-3 … */
export const uniqueName = (base: string, taken: Iterable<string>): string => {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let i = 2; ; i++) if (!used.has(`${base}-${i}`)) return `${base}-${i}`;
};

/** Data paths become named volumes (`<container>-data`, `<container>-data-2`, …) so data survives recreation. */
export const namedVolumes = (container: string, paths: readonly string[]): string[] =>
  paths.map((path, i) => `${container}-data${i === 0 ? "" : `-${i + 1}`}:${path}`);

/** Inverse of `splitCommand`: quotes the arguments that need it so the line splits back into the same list. */
export const joinCommand = (args: readonly string[]): string =>
  args
    .map((a) => {
      if (a !== "" && !/[\s"']/.test(a)) return a;
      return a.includes('"') ? `'${a}'` : `"${a}"`;
    })
    .join(" ");

/** Splits a command line into arguments, honouring single and double quotes (no shell is involved). */
export const splitCommand = (line: string): string[] => {
  const args: string[] = [];
  let current = "";
  let quote: string | null = null;
  let started = false;
  for (const ch of line) {
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      started = true;
    } else if (/\s/.test(ch)) {
      if (started || current) args.push(current);
      current = "";
      started = false;
    } else {
      current += ch;
    }
  }
  if (started || current) args.push(current);
  return args;
};
