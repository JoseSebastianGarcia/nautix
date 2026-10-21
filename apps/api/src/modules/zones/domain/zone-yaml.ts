import { type ServiceSpec, ZONE_SPEC_VERSION, ZoneSpec } from "@nautix/contracts";
import { parse, stringify } from "yaml";

export type ParsedZone =
  | { ok: true; spec: ZoneSpec }
  | { ok: false; errors: { path: string; message: string }[] };

/** Text → validated spec. Every problem is reported with the path where it is. */
export const parseZoneSpec = (text: string): ParsedZone => {
  let raw: unknown;
  try {
    raw = parse(text);
  } catch (error) {
    return {
      ok: false,
      errors: [{ path: "", message: `not valid YAML: ${(error as Error).message.split("\n")[0]}` }],
    };
  }
  const result = ZoneSpec.safeParse(raw);
  if (result.success) return { ok: true, spec: result.data };
  return {
    ok: false,
    errors: result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
  };
};

/** Leaves out what is the default, so the document says only what matters. */
const prune = (s: ServiceSpec): Record<string, unknown> => ({
  image: s.image,
  ...(Object.keys(s.env).length > 0 ? { env: s.env } : {}),
  ...(s.ports.length > 0
    ? {
        ports: s.ports.map((p) => ({
          container: p.container,
          ...(p.protocol !== "tcp" ? { protocol: p.protocol } : {}),
          ...(p.host !== undefined ? { host: p.host } : {}),
          ...(p.expose !== "local" ? { expose: p.expose } : {}),
        })),
      }
    : {}),
  ...(s.volumes.length > 0 ? { volumes: s.volumes } : {}),
  ...(s.command ? { command: s.command } : {}),
  ...(s.restart !== "unless-stopped" ? { restart: s.restart } : {}),
  ...(s.bindings.length > 0
    ? {
        bindings: s.bindings.map((b) => ({
          to: b.to,
          ...(b.name ? { name: b.name } : {}),
          ...(b.style !== "dotnet" ? { style: b.style } : {}),
        })),
      }
    : {}),
});

/** Spec → readable YAML (services in name order, defaults omitted). */
export const stringifyZoneSpec = (spec: ZoneSpec): string =>
  stringify(
    {
      version: ZONE_SPEC_VERSION,
      zone: { name: spec.zone.name, ...(spec.zone.internal ? { internal: true } : {}) },
      services: Object.fromEntries(
        Object.entries(spec.services)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([name, service]) => [name, prune(service)]),
      ),
    },
    { lineWidth: 0 },
  );
