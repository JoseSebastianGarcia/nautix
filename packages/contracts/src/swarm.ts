import { z } from "zod";
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
});
export type CreateSwarmService = z.infer<typeof CreateSwarmService>;
export type CreateSwarmServiceInput = z.input<typeof CreateSwarmService>;

export const UpdateSwarmService = z.object({
  replicas: z.number().int().min(0).max(1000).optional(),
  image: z.string().min(1).max(255).optional(),
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
