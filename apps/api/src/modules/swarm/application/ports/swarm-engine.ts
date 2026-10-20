import type {
  CreateSwarmService,
  SwarmItem,
  SwarmNode,
  SwarmService,
  SwarmStatus,
  SwarmTask,
  UpdateSwarmNode,
  UpdateSwarmService,
} from "@nautix/contracts";

/** Port: the engine's swarm API (cluster, nodes, services, secrets, configs). */
export abstract class SwarmEngine {
  abstract status(): Promise<SwarmStatus>;
  abstract init(advertiseAddr: string | undefined): Promise<string>;
  abstract join(
    remoteAddr: string,
    token: string,
    advertiseAddr: string | undefined,
  ): Promise<void>;
  abstract leave(force: boolean): Promise<void>;
  abstract joinTokens(): Promise<{ worker: string; manager: string }>;
  abstract rotateToken(target: "worker" | "manager"): Promise<void>;
  abstract setAutolock(enabled: boolean): Promise<void>;
  abstract unlockKey(): Promise<string>;
  abstract unlock(key: string): Promise<void>;

  abstract nodes(): Promise<SwarmNode[]>;
  abstract updateNode(id: string, patch: UpdateSwarmNode): Promise<void>;
  abstract removeNode(id: string, force: boolean): Promise<void>;

  abstract services(): Promise<SwarmService[]>;
  abstract tasks(serviceId: string): Promise<SwarmTask[]>;
  abstract serviceLogs(serviceId: string, tail: number): Promise<string>;
  abstract createService(request: CreateSwarmService): Promise<{ id: string }>;
  abstract updateService(id: string, patch: UpdateSwarmService): Promise<void>;
  abstract removeService(id: string): Promise<void>;

  abstract secrets(): Promise<SwarmItem[]>;
  abstract createSecret(name: string, value: string): Promise<void>;
  abstract removeSecret(id: string): Promise<void>;
  abstract configs(): Promise<SwarmItem[]>;
  abstract configData(id: string): Promise<string>;
  abstract createConfig(name: string, value: string): Promise<void>;
  abstract removeConfig(id: string): Promise<void>;
}
