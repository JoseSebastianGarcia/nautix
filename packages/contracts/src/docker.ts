import { z } from "zod";
import { isIpAddress } from "./ip.js";
import { BindMount, isContainerPath, isHostPath, MountRisk } from "./mounts.js";

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
  /** IP address on each network (only while the container runs): what a DNS record should point to. */
  ips: z.record(z.string(), z.string()).optional(),
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
  /** Overlay networks only: traffic between nodes is encrypted. */
  encrypted: z.boolean().optional(),
  /** Overlay networks only: standalone containers can join, not only services. */
  attachable: z.boolean().optional(),
});
export type Network = z.infer<typeof Network>;

/** What this engine is in a swarm: nothing, a worker, a manager, or a locked manager. */
export type SwarmRole = "none" | "worker" | "manager" | "locked";

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
  /** `overlay` spans the nodes of a swarm and needs this engine to be a manager. */
  driver: z.enum(["bridge", "overlay"]).default("bridge"),
  /** Overlay only: encrypt traffic between nodes (Docker leaves it off by default). */
  encrypted: z.boolean().default(false),
  /** Overlay only: let standalone containers (not only services) join. */
  attachable: z.boolean().default(false),
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
        protocol: z.enum(["tcp", "udp"]).default("tcp"),
        hostPort: z.number().int().min(1).max(65535).optional(),
        /** false = bound to 127.0.0.1 only (default); true = 0.0.0.0, needs explicit consent. */
        exposePublicly: z.boolean().default(false),
        /** Bind to one host address (for example the LAN or VPN IP). Wins over `exposePublicly`. */
        bindAddress: z.string().trim().refine(isIpAddress, "invalid IP address").optional(),
      }),
    )
    .default([]),
  labels: z.record(z.string(), z.string()).default({}),
  /** `unless-stopped` suits services; one-shot images (hello-world) need `no` or they restart forever. */
  restartPolicy: RestartPolicy.default("unless-stopped"),
  command: z.array(z.string()).optional(),
  /** Named volumes (`name:/path`). */
  volumes: z.array(z.string()).default([]),
  /** Host folder mappings (`/host:/container`); a risky one needs its risk in `acceptRisks`. */
  mounts: z.array(BindMount).max(32).default([]),
  /** Risks the person accepted explicitly (the Docker socket, the host root, sensitive folders). */
  acceptRisks: z.array(MountRisk).default([]),
  /** Optional fixed IPv4 on `networkId` (must be inside the network's subnet and unused). */
  ipAddress: z
    .string()
    .regex(/^((25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(25[0-5]|2[0-4]\d|1?\d?\d)$/, "invalid IPv4 address")
    .optional(),
  /** false = `docker create`: the container is made but not started. */
  start: z.boolean().default(true),
  /** Shell command run inside the container; exit 0 = healthy. */
  healthcheck: z
    .object({
      command: z.string().min(1).max(1000),
      intervalSeconds: z.number().int().min(1).max(3600).default(30),
      timeoutSeconds: z.number().int().min(1).max(600).default(5),
      retries: z.number().int().min(1).max(20).default(3),
      startPeriodSeconds: z.number().int().min(0).max(3600).default(0),
    })
    .optional(),
  limits: z
    .object({
      memoryMb: z.number().int().min(6).max(1_048_576).optional(),
      cpus: z.number().min(0.01).max(256).optional(),
    })
    .optional(),
});
export type CreateContainer = z.infer<typeof CreateContainer>;
export type CreateContainerInput = z.input<typeof CreateContainer>;

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

export const ComposeAction = z.enum(["up", "down", "pull", "config", "ps", "logs", "build"]);
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
        protocol: z.enum(["tcp", "udp"]).optional(),
        hostPort: z.number().int().min(1).max(65535).optional(),
      }),
    )
    .max(32)
    .default([]),
  env: z.record(z.string().max(128), z.string().max(4096)).default({}),
  /** Container paths that become named volumes. */
  volumes: z.array(z.string().min(1).max(255)).max(32).default([]),
  /** Host folder mappings the template carries. */
  mounts: z
    .array(
      z.object({
        source: z.string().min(1).max(1024).refine(isHostPath, "must be an absolute host path"),
        target: z.string().min(1).max(1024).refine(isContainerPath, "must start with /"),
        readOnly: z.boolean().optional(),
      }),
    )
    .max(32)
    .default([]),
  command: z.array(z.string().max(512)).max(64).optional(),
});
export type CustomTemplateInput = z.infer<typeof CustomTemplateInput>;

export const ContainerStats = z.object({
  cpuPercent: z.number(),
  memoryBytes: z.number(),
  memoryLimitBytes: z.number(),
  networkRxBytes: z.number(),
  networkTxBytes: z.number(),
  pids: z.number(),
});
export type ContainerStats = z.infer<typeof ContainerStats>;

export const ContainerTop = z.object({
  titles: z.array(z.string()),
  processes: z.array(z.array(z.string())),
});
export type ContainerTop = z.infer<typeof ContainerTop>;

export const FsChange = z.object({
  kind: z.enum(["added", "modified", "deleted"]),
  path: z.string(),
});
export type FsChange = z.infer<typeof FsChange>;

export const RenameContainer = z.object({ name: ResourceName });
export type RenameContainer = z.infer<typeof RenameContainer>;

export const UpdateContainer = z.object({
  restartPolicy: RestartPolicy.optional(),
  /** 0 = unlimited. */
  memoryMb: z.number().int().min(0).max(1_048_576).optional(),
  cpus: z.number().min(0).max(1024).optional(),
});
export type UpdateContainer = z.infer<typeof UpdateContainer>;

export const CommitContainer = z.object({
  repository: z.string().min(1).max(255),
  tag: z.string().max(128).default("latest"),
  comment: z.string().max(500).optional(),
  pause: z.boolean().default(true),
});
export type CommitContainer = z.infer<typeof CommitContainer>;

export const WaitResult = z.object({ exited: z.boolean(), statusCode: z.number().nullable() });
export type WaitResult = z.infer<typeof WaitResult>;

export const KILL_SIGNALS = [
  "SIGKILL",
  "SIGTERM",
  "SIGINT",
  "SIGHUP",
  "SIGUSR1",
  "SIGUSR2",
  "SIGQUIT",
] as const;

/** Same character set Docker allows in references, so the value is safe inside an API path. */
export const ImageReference = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_.:/@-]*$/, "invalid image reference");

export const TagImage = z.object({
  reference: ImageReference,
  repository: ImageReference,
  tag: z
    .string()
    .regex(/^[\w][\w.-]{0,127}$/)
    .default("latest"),
});
export type TagImage = z.infer<typeof TagImage>;

export const ImageHistoryEntry = z.object({
  id: z.string(),
  createdAt: z.number(),
  createdBy: z.string(),
  size: z.number(),
  tags: z.array(z.string()),
});
export type ImageHistoryEntry = z.infer<typeof ImageHistoryEntry>;

export const ImageSearchResult = z.object({
  name: z.string(),
  description: z.string(),
  stars: z.number(),
  official: z.boolean(),
});
export type ImageSearchResult = z.infer<typeof ImageSearchResult>;

/** Credentials are used for one request and never stored or logged. */
export const RegistryAuth = z.object({
  username: z.string().min(1).max(256),
  password: z.string().min(1).max(4096),
  serveraddress: z.string().max(255).optional(),
});
export type RegistryAuth = z.infer<typeof RegistryAuth>;

export const PushImage = z.object({ reference: ImageReference, auth: RegistryAuth.optional() });
export type PushImage = z.infer<typeof PushImage>;

export const PruneKind = z.enum(["containers", "images", "volumes", "networks"]);
export type PruneKind = z.infer<typeof PruneKind>;

export const PruneItem = z.object({
  kind: PruneKind,
  /** What the remove endpoint takes: the id (containers, images, networks) or the name (volumes). */
  id: z.string().optional(),
  name: z.string(),
  size: z.number().optional(),
});
export type PruneItem = z.infer<typeof PruneItem>;

export const PrunePreview = z.object({ items: z.array(PruneItem), reclaimableBytes: z.number() });
export type PrunePreview = z.infer<typeof PrunePreview>;

export const PruneRequest = z.object({
  kind: PruneKind,
  /** images: also unused (not only dangling) ones; volumes: also named volumes. */
  all: z.boolean().default(false),
});
export type PruneRequest = z.infer<typeof PruneRequest>;

export const PruneResult = z.object({ deleted: z.number(), reclaimedBytes: z.number() });
export type PruneResult = z.infer<typeof PruneResult>;

const UsageBucket = z.object({
  count: z.number(),
  active: z.number(),
  sizeBytes: z.number(),
  reclaimableBytes: z.number(),
});
export const DiskUsage = z.object({
  images: UsageBucket,
  containers: UsageBucket,
  volumes: UsageBucket,
  buildCache: UsageBucket,
});
export type DiskUsage = z.infer<typeof DiskUsage>;

export const EngineEvent = z.object({
  time: z.number(),
  type: z.string(),
  action: z.string(),
  id: z.string(),
  name: z.string().nullable(),
});
export type EngineEvent = z.infer<typeof EngineEvent>;

/** A saved registry login. The password is encrypted at rest and never returned. */
export const RegistryInfo = z.object({ server: z.string(), username: z.string() });
export type RegistryInfo = z.infer<typeof RegistryInfo>;

export const SaveRegistry = z.object({
  server: z.string().min(1).max(255),
  username: z.string().min(1).max(256),
  password: z.string().min(1).max(4096),
});
export type SaveRegistry = z.infer<typeof SaveRegistry>;

const BuildFilePath = z
  .string()
  .regex(/^[A-Za-z0-9._-][A-Za-z0-9._/-]{0,98}$/, "invalid path")
  .refine((p) => !p.split("/").some((part) => part === ".." || part === ""), "invalid path");

/** A build whose context is the Dockerfile plus a few small text files typed in the editor. */
export const BuildRequest = z.object({
  tag: ImageReference,
  dockerfile: z.string().min(1).max(200_000),
  files: z
    .array(z.object({ path: BuildFilePath, content: z.string().max(1_000_000) }))
    .max(50)
    .default([]),
  buildArgs: z.record(z.string().max(128), z.string().max(4096)).default({}),
  target: z.string().max(128).optional(),
  noCache: z.boolean().default(false),
  pull: z.boolean().default(false),
});
export type BuildRequest = z.infer<typeof BuildRequest>;

/** Options of a build whose context is a tar uploaded as the request body (a project folder). */
export const BuildContextOptions = BuildRequest.omit({ dockerfile: true, files: true }).extend({
  /** Path of the Dockerfile inside the uploaded context. */
  dockerfilePath: BuildFilePath.default("Dockerfile"),
});
export type BuildContextOptions = z.infer<typeof BuildContextOptions>;

export interface VolumeEntry {
  name: string;
  kind: "dir" | "file" | "link" | "other";
  size: number;
  modified: string;
  mode: string;
}

export type VolumeBrowseResult =
  | { kind: "directory"; path: string; entries: VolumeEntry[] }
  | { kind: "file"; path: string; content: string; truncated: boolean };

export interface PluginInfo {
  id: string;
  /** `name:tag`, e.g. `vieux/sshfs:latest`. */
  name: string;
  enabled: boolean;
  description: string;
}

/** What a plugin asks the host for; shown to the user before it is installed. */
export interface PluginPrivilege {
  name: string;
  description: string;
  value: string[];
}

export const InstallPlugin = z.object({
  remote: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9_.:/@-]*$/, "invalid reference"),
  /** The privileges the user saw and accepted; they must match what the plugin asks for. */
  privileges: z.array(
    z.object({
      name: z.string(),
      description: z.string().default(""),
      value: z.array(z.string()),
    }),
  ),
});
export type InstallPlugin = z.infer<typeof InstallPlugin>;
