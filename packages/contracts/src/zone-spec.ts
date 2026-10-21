import { z } from "zod";
import { BINDING_STYLES } from "./binding.js";
import { ResourceName, RestartPolicy } from "./docker.js";
import { isIpAddress } from "./ip.js";

export const ZONE_SPEC_VERSION = 1;

const Port = z.number().int().min(1).max(65535);

/** Who can reach a published port: this machine, every interface, or one host address. */
export const SpecExpose = z.union([
  z.literal("local"),
  z.literal("open"),
  z.string().trim().refine(isIpAddress, "use local, open or an IP address"),
]);
export type SpecExpose = z.infer<typeof SpecExpose>;

export const ServicePort = z
  .object({
    container: Port,
    protocol: z.enum(["tcp", "udp"]).default("tcp"),
    /** Host port; left out, the engine picks one. */
    host: Port.optional(),
    expose: SpecExpose.default("local"),
  })
  .strict();
export type ServicePort = z.infer<typeof ServicePort>;

const BindingName = z.string().regex(/^[A-Za-z][A-Za-z0-9]{0,40}$/, "letters and numbers");

export const ServiceBinding = z
  .object({
    to: ResourceName,
    name: BindingName.optional(),
    style: z.enum(BINDING_STYLES).default("dotnet"),
  })
  .strict();
export type ServiceBinding = z.infer<typeof ServiceBinding>;

const EnvName = z.string().regex(/^[A-Za-z_][A-Za-z0-9_.-]{0,127}$/, "invalid variable name");

export const ServiceSpec = z
  .object({
    image: z.string().min(1).max(255),
    env: z.record(EnvName, z.string().max(8192)).default({}),
    ports: z.array(ServicePort).max(50).default([]),
    /** Docker `-v` strings: `name:/path[:ro]`, `/host/path:/path`, or a bare `/path` (anonymous). */
    volumes: z.array(z.string().min(1).max(512)).max(50).default([]),
    command: z.array(z.string().max(1024)).max(100).optional(),
    restart: RestartPolicy.default("unless-stopped"),
    bindings: z.array(ServiceBinding).max(50).default([]),
  })
  .strict();
export type ServiceSpec = z.infer<typeof ServiceSpec>;

export const ZoneSpec = z
  .object({
    version: z.literal(ZONE_SPEC_VERSION),
    zone: z
      .object({
        name: ResourceName,
        /** No route to the outside world. */
        internal: z.boolean().default(false),
      })
      .strict(),
    services: z.record(ResourceName, ServiceSpec).default({}),
  })
  .strict()
  .superRefine((spec, ctx) => {
    const names = Object.keys(spec.services);
    for (const [name, service] of Object.entries(spec.services)) {
      const seen = new Set<string>();
      for (const [i, b] of service.bindings.entries()) {
        const path = ["services", name, "bindings", i, "to"];
        if (!names.includes(b.to))
          ctx.addIssue({
            code: "custom",
            path,
            message: `"${b.to}" is not a service of this zone`,
          });
        if (b.to === name)
          ctx.addIssue({ code: "custom", path, message: "a service cannot be bound to itself" });
        const label = b.name ?? b.to;
        if (seen.has(label))
          ctx.addIssue({ code: "custom", path, message: `two bindings are called "${label}"` });
        seen.add(label);
      }
      const ports = new Set<string>();
      for (const [i, p] of service.ports.entries()) {
        const key = `${p.container}/${p.protocol}`;
        if (ports.has(key))
          ctx.addIssue({
            code: "custom",
            path: ["services", name, "ports", i],
            message: `port ${key} is listed twice`,
          });
        ports.add(key);
      }
    }
    // One host port can be given to one service only.
    const hostPorts = new Map<string, string>();
    for (const [name, service] of Object.entries(spec.services))
      for (const p of service.ports) {
        if (p.host === undefined) continue;
        const key = `${p.host}/${p.protocol}`;
        const owner = hostPorts.get(key);
        if (owner && owner !== name)
          ctx.addIssue({
            code: "custom",
            path: ["services", name, "ports"],
            message: `host port ${key} is already used by "${owner}"`,
          });
        hostPorts.set(key, name);
      }
  });
export type ZoneSpec = z.infer<typeof ZoneSpec>;

/** Something found while reading or planning: a message key and its values, translated by the UI. */
export interface ZoneNote {
  key: string;
  params?: Record<string, string | number>;
}

export type ZoneAction =
  | { kind: "create-network"; name: string; internal: boolean }
  | { kind: "create-service"; service: string }
  | { kind: "update-service"; service: string; fields: string[] }
  | { kind: "replace-service"; service: string; fields: string[] }
  | { kind: "remove-service"; service: string }
  | { kind: "add-binding"; consumer: string; provider: string; name: string; style: string }
  | { kind: "remove-binding"; consumer: string; provider: string; name: string }
  /** The service a binding reads from changed: write its settings into the consumer again. */
  | { kind: "reapply-binding"; consumer: string; provider: string; name: string };

export interface ZonePlan {
  actions: ZoneAction[];
  warnings: ZoneNote[];
  errors: ZoneNote[];
  /** Identifies this exact plan: apply refuses to run if reality changed since it was shown. */
  hash: string;
}

export type ZoneActionResult = {
  action: ZoneAction;
  status: "done" | "failed" | "skipped";
  /** Why it failed or was skipped (for a rolled-back change, the new container's last log lines). */
  detail?: string;
};

export interface ZoneApplyResult {
  ok: boolean;
  results: ZoneActionResult[];
}

export const ApplyZone = z.object({
  spec: z.string().min(1).max(500_000),
  planHash: z.string().min(1).max(64),
  allowRemovals: z.boolean().default(false),
});
export type ApplyZone = z.infer<typeof ApplyZone>;

export const PlanZoneRequest = z.object({ spec: z.string().min(1).max(500_000) });
export type PlanZoneRequest = z.infer<typeof PlanZoneRequest>;
