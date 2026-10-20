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

export const randomSecret = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, "x");
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
