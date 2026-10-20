import { z } from "zod";

export const ContainerState = z.enum([
  "created",
  "running",
  "paused",
  "restarting",
  "removing",
  "exited",
  "dead",
]);
export type ContainerState = z.infer<typeof ContainerState>;

export const PortBinding = z.object({
  ip: z.string().optional(),
  privatePort: z.number().int(),
  publicPort: z.number().int().optional(),
  type: z.string(),
});
export type PortBinding = z.infer<typeof PortBinding>;

export const Container = z.object({
  id: z.string(),
  name: z.string(),
  image: z.string(),
  state: ContainerState,
  status: z.string(),
  createdAt: z.number(),
  ports: z.array(PortBinding),
  networks: z.array(z.string()),
  labels: z.record(z.string(), z.string()),
  /** True for the container running Nautix itself (set by the API, never by the engine). */
  isSelf: z.boolean().optional(),
});
export type Container = z.infer<typeof Container>;

export const Network = z.object({
  id: z.string(),
  name: z.string(),
  driver: z.string(),
  internal: z.boolean(),
  subnet: z.string().nullable(),
  containerIds: z.array(z.string()),
  system: z.boolean(),
});
export type Network = z.infer<typeof Network>;

export const Image = z.object({
  id: z.string(),
  tags: z.array(z.string()),
  size: z.number(),
  createdAt: z.number(),
  inUse: z.boolean(),
});
export type Image = z.infer<typeof Image>;

export const Volume = z.object({
  name: z.string(),
  driver: z.string(),
  mountpoint: z.string(),
  createdAt: z.string().nullable(),
  inUse: z.boolean(),
});
export type Volume = z.infer<typeof Volume>;

export const EngineInfo = z.object({
  connected: z.boolean(),
  engine: z.enum(["socket", "fake"]),
  version: z.string().nullable(),
  os: z.string().nullable(),
  containers: z.number(),
  running: z.number(),
  images: z.number(),
});
export type EngineInfo = z.infer<typeof EngineInfo>;

/** Names: same rule Docker uses for containers/networks/volumes. */
export const ResourceName = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,62}$/, "invalid name");

export const CreateNetwork = z.object({
  name: ResourceName,
  /** Internal = no route to the outside world. Safe default. */
  internal: z.boolean().default(true),
  subnet: z
    .string()
    .regex(/^\d{1,3}(\.\d{1,3}){3}\/\d{1,2}$/, "invalid CIDR")
    .optional(),
});
export type CreateNetwork = z.infer<typeof CreateNetwork>;

export const CreateVolume = z.object({ name: ResourceName });
export type CreateVolume = z.infer<typeof CreateVolume>;

export const PullImage = z.object({ reference: z.string().min(1).max(255) });
export type PullImage = z.infer<typeof PullImage>;

export const ConnectNetwork = z.object({ containerId: z.string().min(1) });
export type ConnectNetwork = z.infer<typeof ConnectNetwork>;

export const ContainerAction = z.enum(["start", "stop", "restart", "kill", "pause", "unpause"]);
export type ContainerAction = z.infer<typeof ContainerAction>;

export const RestartPolicy = z.enum(["no", "unless-stopped", "always", "on-failure"]);
export type RestartPolicy = z.infer<typeof RestartPolicy>;

export const CreateContainer = z.object({
  name: ResourceName,
  image: z.string().min(1).max(255),
  /** null = outside every zone (default bridge). */
  networkId: z.string().nullable(),
  env: z.record(z.string(), z.string()).default({}),
  ports: z
    .array(
      z.object({
        containerPort: z.number().int().min(1).max(65535),
        hostPort: z.number().int().min(1).max(65535).optional(),
        /** false = bound to 127.0.0.1 only (default); true = 0.0.0.0, needs explicit consent. */
        exposePublicly: z.boolean().default(false),
      }),
    )
    .default([]),
  labels: z.record(z.string(), z.string()).default({}),
  /** `unless-stopped` suits services; one-shot images (hello-world) need `no` or they restart forever. */
  restartPolicy: RestartPolicy.default("unless-stopped"),
  command: z.array(z.string()).optional(),
  volumes: z.array(z.string()).default([]),
});
export type CreateContainer = z.infer<typeof CreateContainer>;

export const Mount = z.object({
  type: z.enum(["bind", "volume", "tmpfs"]),
  /** Volume name for `volume`, host path for `bind`. */
  source: z.string(),
  target: z.string(),
  readOnly: z.boolean(),
});
export type Mount = z.infer<typeof Mount>;

/** What was explicitly configured for a container (image defaults removed). */
export const ContainerDetails = z.object({
  id: z.string(),
  name: z.string(),
  image: z.string(),
  env: z.record(z.string(), z.string()),
  command: z.array(z.string()).nullable(),
  restartPolicy: z.string(),
  mounts: z.array(Mount),
});
export type ContainerDetails = z.infer<typeof ContainerDetails>;

const Point = z.object({
  x: z.number().finite().min(-100000).max(100000),
  y: z.number().finite().min(-100000).max(100000),
});

/**
 * Saved canvas positions. `zones` is keyed by network name (or "external") with absolute
 * coordinates; `nodes` is keyed by container name with coordinates relative to its zone.
 */
export const Layout = z.object({
  zones: z.record(z.string().max(128), Point).refine((r) => Object.keys(r).length <= 500),
  nodes: z.record(z.string().max(128), Point).refine((r) => Object.keys(r).length <= 2000),
});
export type Layout = z.infer<typeof Layout>;

export const ComposeProjectName = z
  .string()
  .regex(/^[a-z0-9][a-z0-9_-]{0,62}$/, "invalid project name");

export const ComposeProjectSummary = z.object({ name: z.string(), updatedAt: z.number() });
export type ComposeProjectSummary = z.infer<typeof ComposeProjectSummary>;

export const ComposeProject = ComposeProjectSummary.extend({ content: z.string() });
export type ComposeProject = z.infer<typeof ComposeProject>;

/** 256 KB is far above any real Compose file and keeps requests cheap to validate. */
export const SaveComposeProject = z.object({ content: z.string().max(262_144) });
export type SaveComposeProject = z.infer<typeof SaveComposeProject>;

export const ComposeAction = z.enum(["up", "down", "pull", "config"]);
export type ComposeAction = z.infer<typeof ComposeAction>;

export const RunComposeAction = z.object({
  /** Needed when the file uses privileged mode, host network, the Docker socket, etc. */
  acknowledgeRisks: z.boolean().default(false),
  /** `down` only: also delete named volumes (data loss). */
  removeVolumes: z.boolean().default(false),
});
export type RunComposeAction = z.infer<typeof RunComposeAction>;

export const ComposeRunResult = z.object({
  ok: z.boolean(),
  exitCode: z.number().nullable(),
  output: z.string(),
});
export type ComposeRunResult = z.infer<typeof ComposeRunResult>;

/** What a user can save as a reusable template from the deploy dialog. */
export const CustomTemplateInput = z.object({
  name: z.string().min(1).max(64),
  image: z.string().min(1).max(255),
  description: z.string().max(200).default(""),
  ports: z
    .array(
      z.object({
        containerPort: z.number().int().min(1).max(65535),
        label: z.string().max(32).default(""),
      }),
    )
    .max(32)
    .default([]),
  env: z.record(z.string().max(128), z.string().max(4096)).default({}),
  /** Container paths that become named volumes. */
  volumes: z.array(z.string().min(1).max(255)).max(32).default([]),
  command: z.array(z.string().max(512)).max(64).optional(),
});
export type CustomTemplateInput = z.infer<typeof CustomTemplateInput>;
