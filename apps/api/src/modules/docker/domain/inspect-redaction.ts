/**
 * Inspect output includes environment values (often secrets). Read-only users get the variable
 * names only, same as the Compose export.
 */
export const redactInspect = (raw: unknown): unknown => {
  if (!raw || typeof raw !== "object") return raw;
  const copy = structuredClone(raw) as { Config?: { Env?: string[] | null } };
  if (Array.isArray(copy.Config?.Env)) {
    copy.Config.Env = copy.Config.Env.map((e) => `${e.split("=")[0]}=<hidden>`);
  }
  return copy;
};
