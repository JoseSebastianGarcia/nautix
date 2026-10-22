import { z } from "zod";
import { BINDING_STYLES, type BindingKind } from "./binding.js";
import { ResourceName } from "./docker.js";

export const SwarmStatus = z.object({
  active: z.boolean(),
  nodeId: z.string().nullable(),
  isManager: z.boolean(),
  managers: z.number(),
  nodes: z.number(),
  nodeAddr: z.string().nullable(),
  clusterId: z.string().nullable(),
  /** The swarm is locked and needs its unlock key before it can be used. */
  locked: z.boolean(),
});
export type SwarmStatus = z.infer<typeof SwarmStatus>;

export const SwarmNode = z.object({
  id: z.string(),
  hostname: z.string(),
  role: z.enum(["manager", "worker"]),
  availability: z.enum(["active", "pause", "drain"]),
  state: z.string(),
  address: z.string(),
  leader: z.boolean(),
  engineVersion: z.string(),
});
export type SwarmNode = z.infer<typeof SwarmNode>;

export const SwarmPort = z.object({
  target: z.number().int().min(1).max(65535),
  published: z.number().int().min(1).max(65535).optional(),
  protocol: z.enum(["tcp", "udp"]).default("tcp"),
});
export type SwarmPort = z.infer<typeof SwarmPort>;

/** Where a service may run. Everything is optional: no field means "anywhere". */
export const SwarmPlacement = z.object({
  role: z.enum(["manager", "worker"]).optional(),
  /** Pin to one node (its id): the way to keep a service next to its local volume. */
  nodeId: z.string().min(1).max(64).optional(),
  /** At most this many copies on each node. */
  maxPerNode: z.number().int().min(1).max(1000).optional(),
});
export type SwarmPlacement = z.infer<typeof SwarmPlacement>;

/** A named volume mounted in every copy. The volume lives on the node where the copy runs. */
export const SwarmMount = z.object({
  source: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/),
  target: z.string().regex(/^\/[^\0]{0,255}$/),
  readOnly: z.boolean().default(false),
});
export type SwarmMount = z.infer<typeof SwarmMount>;

/** How a change of the service (image, networks, placement) rolls out, and what happens when it goes wrong. */
export const SwarmUpdatePolicy = z.object({
  /**
   * start-first brings the new copy up before stopping the old one; stop-first needs no spare capacity.
   * Left out, it is stop-first for a service with volumes or a limit per node (a second copy could not
   * start beside the first) and start-first otherwise.
   */
  order: z.enum(["start-first", "stop-first"]).optional(),
  failureAction: z.enum(["rollback", "pause"]).default("rollback"),
  parallelism: z.number().int().min(1).max(100).default(1),
  delaySeconds: z.number().int().min(0).max(3600).default(5),
  monitorSeconds: z.number().int().min(0).max(3600).default(10),
});
export type SwarmUpdatePolicy = z.infer<typeof SwarmUpdatePolicy>;

/** Run with `/bin/sh -c` inside the container; healthy while it exits 0. */
export const SwarmHealthcheck = z.object({
  command: z.string().min(1).max(1000),
  intervalSeconds: z.number().int().min(1).max(3600).default(30),
  timeoutSeconds: z.number().int().min(1).max(3600).default(10),
  retries: z.number().int().min(1).max(100).default(3),
  startPeriodSeconds: z.number().int().min(0).max(3600).default(0),
});
export type SwarmHealthcheck = z.infer<typeof SwarmHealthcheck>;

/** Limits cap what a copy may use; reservations are what the scheduler sets aside for it on a node. */
export const SwarmResources = z.object({
  cpuLimit: z.number().min(0.01).max(256).optional(),
  memoryLimitMb: z.number().int().min(4).max(10_000_000).optional(),
  cpuReserve: z.number().min(0.01).max(256).optional(),
  memoryReserveMb: z.number().int().min(4).max(10_000_000).optional(),
});
export type SwarmResources = z.infer<typeof SwarmResources>;

export const SwarmUpdateState = z.enum([
  "updating",
  "paused",
  "completed",
  "rollback_started",
  "rollback_paused",
  "rollback_completed",
]);
export type SwarmUpdateState = z.infer<typeof SwarmUpdateState>;

export const SwarmService = z.object({
  id: z.string(),
  name: z.string(),
  image: z.string(),
  mode: z.enum(["replicated", "global"]),
  replicas: z.number().nullable(),
  running: z.number(),
  desired: z.number(),
  ports: z.array(SwarmPort),
  stack: z.string().nullable(),
  /** Ids of the networks the service is attached to. */
  networks: z.array(z.string()),
  mounts: z.array(SwarmMount),
  placement: SwarmPlacement,
  /** Names of the secrets the service receives (files under /run/secrets). */
  secrets: z.array(z.string()),
  /** Names of the configs the service receives (files at `/<name>`). */
  configs: z.array(z.string()),
  healthcheck: SwarmHealthcheck.nullable(),
  resources: SwarmResources,
  /** How updates roll out, as the service has it now (Docker's own defaults when it never set one). */
  policy: SwarmUpdatePolicy.required({ order: true }),
  /** The last rolling update: its state and what Docker said about it. */
  update: z.object({
    state: SwarmUpdateState.nullable(),
    message: z.string(),
    /** When that update started: a new one is told from the previous by this. */
    startedAt: z.string(),
  }),
  updatedAt: z.string(),
});
export type SwarmService = z.infer<typeof SwarmService>;

export const SwarmTask = z.object({
  id: z.string(),
  slot: z.number().nullable(),
  nodeId: z.string(),
  state: z.string(),
  desiredState: z.string(),
  error: z.string(),
  image: z.string(),
  updatedAt: z.string(),
});
export type SwarmTask = z.infer<typeof SwarmTask>;

/** A task together with the service it belongs to, so the whole cluster can be read in one call. */
export const ClusterTask = SwarmTask.extend({ serviceId: z.string() });
export type ClusterTask = z.infer<typeof ClusterTask>;

/** Everything a manager knows about the cluster. A node that is not a manager gets empty lists. */
export interface SwarmCluster {
  status: SwarmStatus;
  nodes: SwarmNode[];
  services: SwarmService[];
  tasks: ClusterTask[];
}

export const SwarmItem = z.object({ id: z.string(), name: z.string(), createdAt: z.string() });
export type SwarmItem = z.infer<typeof SwarmItem>;

export const InitSwarm = z.object({ advertiseAddr: z.string().min(1).max(255).optional() });
export type InitSwarm = z.infer<typeof InitSwarm>;

export const JoinSwarm = z.object({
  remoteAddr: z.string().min(1).max(255),
  token: z.string().min(1).max(512),
  advertiseAddr: z.string().min(1).max(255).optional(),
});
export type JoinSwarm = z.infer<typeof JoinSwarm>;

export const LeaveSwarm = z.object({ force: z.boolean().default(false) });
export type LeaveSwarm = z.infer<typeof LeaveSwarm>;

export const RotateToken = z.object({ target: z.enum(["worker", "manager"]) });
export type RotateToken = z.infer<typeof RotateToken>;

export const Autolock = z.object({ enabled: z.boolean() });
export type Autolock = z.infer<typeof Autolock>;

export const UnlockSwarm = z.object({ key: z.string().min(1).max(512) });
export type UnlockSwarm = z.infer<typeof UnlockSwarm>;

export const UpdateSwarmNode = z.object({
  role: z.enum(["manager", "worker"]).optional(),
  availability: z.enum(["active", "pause", "drain"]).optional(),
});
export type UpdateSwarmNode = z.infer<typeof UpdateSwarmNode>;

export const CreateSwarmService = z.object({
  name: ResourceName,
  image: z.string().min(1).max(255),
  replicas: z.number().int().min(0).max(1000).default(1),
  /** true = one task on every node instead of a number of replicas. */
  global: z.boolean().default(false),
  env: z.record(z.string(), z.string()).default({}),
  ports: z.array(SwarmPort).max(32).default([]),
  command: z.array(z.string()).optional(),
  networks: z.array(z.string().min(1).max(128)).max(16).default([]),
  mounts: z.array(SwarmMount).max(16).default([]),
  placement: SwarmPlacement.default({}),
  /** Secrets by name; each one is mounted at /run/secrets/<name>. */
  secrets: z.array(z.string().min(1).max(128)).max(32).default([]),
  /** Configs by name; each one is mounted at `/<name>`. */
  configs: z.array(z.string().min(1).max(128)).max(32).default([]),
  healthcheck: SwarmHealthcheck.optional(),
  resources: SwarmResources.default({}),
  update: SwarmUpdatePolicy.default({
    failureAction: "rollback",
    parallelism: 1,
    delaySeconds: 5,
    monitorSeconds: 10,
  }),
});
export type CreateSwarmService = z.infer<typeof CreateSwarmService>;
export type CreateSwarmServiceInput = z.input<typeof CreateSwarmService>;

export const UpdateSwarmService = z.object({
  replicas: z.number().int().min(0).max(1000).optional(),
  image: z.string().min(1).max(255).optional(),
  /**
   * Networks to join and to leave, by name or id. Never a full list: the service also holds addresses on
   * networks it did not ask for (the ingress one), and those must not be written back.
   */
  networks: z
    .object({
      add: z.array(z.string().min(1).max(128)).max(16).default([]),
      remove: z.array(z.string().min(1).max(128)).max(16).default([]),
    })
    .optional(),
  placement: SwarmPlacement.optional(),
  /** The complete list of published ports (the engine keeps the rest of the spec). */
  ports: z.array(SwarmPort).max(32).optional(),
  mounts: z
    .object({
      add: z.array(SwarmMount).max(16).default([]),
      /** Mount points (paths in the container) to take out. */
      remove: z.array(z.string().min(1).max(255)).max(16).default([]),
    })
    .optional(),
  secrets: z
    .object({
      add: z.array(z.string().min(1).max(128)).max(32).default([]),
      remove: z.array(z.string().min(1).max(128)).max(32).default([]),
    })
    .optional(),
  configs: z
    .object({
      add: z.array(z.string().min(1).max(128)).max(32).default([]),
      remove: z.array(z.string().min(1).max(128)).max(32).default([]),
    })
    .optional(),
  /** `null` takes the health check out. */
  healthcheck: SwarmHealthcheck.nullable().optional(),
  resources: SwarmResources.optional(),
  /** Only changes how future updates roll out: no copy is replaced. */
  policy: SwarmUpdatePolicy.optional(),
  /** Variables to set and to remove (a binding between services uses this). Values are never read back. */
  env: z
    .object({
      set: z.record(z.string(), z.string()).default({}),
      unset: z.array(z.string().min(1).max(256)).max(64).default([]),
    })
    .optional(),
});
export type UpdateSwarmService = z.infer<typeof UpdateSwarmService>;

/** The value is write-only: the API never returns it for secrets. */
export const CreateSwarmSecret = z.object({
  name: ResourceName,
  value: z.string().min(1).max(500_000),
});
export type CreateSwarmSecret = z.infer<typeof CreateSwarmSecret>;

export const DeployStack = z.object({
  name: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,62}$/),
  yaml: z.string().min(1).max(500_000),
});
export type DeployStack = z.infer<typeof DeployStack>;

export interface StackInfo {
  name: string;
  services: number;
}

/** Wires one service to another (the consumer receives the provider's connection settings in its environment). */
export const CreateSwarmBinding = z.object({
  consumer: z.string().min(1).max(128),
  provider: z.string().min(1).max(128),
  name: z
    .string()
    .regex(/^[A-Za-z][A-Za-z0-9]{0,40}$/, "letters and numbers, starting with a letter")
    .optional(),
  style: z.enum(BINDING_STYLES).default("dotnet"),
});
export type CreateSwarmBinding = z.infer<typeof CreateSwarmBinding>;
export type CreateSwarmBindingInput = z.input<typeof CreateSwarmBinding>;

export interface SwarmBinding {
  id: string;
  /** Service names (stable across updates). */
  consumer: string;
  provider: string;
  kind: BindingKind;
  name: string;
  style: (typeof BINDING_STYLES)[number];
  /** Names of the variables this binding put in the consumer, so removing it removes exactly those. */
  variables: string[];
  /** The overlay they talk over. */
  network: string;
}

export interface SwarmBindingPlan {
  kind: BindingKind;
  name: string;
  network: string;
  /** The consumer has to join that overlay first. */
  joins: boolean;
  /** Variable names with their values, passwords masked. */
  variables: { key: string; preview: string }[];
}
