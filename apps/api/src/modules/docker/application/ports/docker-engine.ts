import type {
  Container,
  ContainerAction,
  ContainerDetails,
  CreateNetwork,
  EngineInfo,
  Image,
  Network,
  Volume,
} from "@nautix/contracts";
import type { EngineContainerSpec } from "../../domain/container-spec.js";

export type EngineEventKind = "container" | "network" | "image" | "volume";

/** Port to the Docker engine. Adapters: DockerSocketEngine (real), FakeDockerEngine (demo/tests). */
export abstract class DockerEngine {
  abstract info(): Promise<EngineInfo>;
  /** Stream of "something of this kind changed" events; ends when the signal aborts. */
  abstract events(signal: AbortSignal): AsyncIterable<EngineEventKind>;

  abstract listContainers(): Promise<Container[]>;
  abstract inspectContainers(ids: string[]): Promise<ContainerDetails[]>;
  abstract createContainer(spec: EngineContainerSpec): Promise<{ id: string }>;
  abstract containerAction(id: string, action: ContainerAction): Promise<void>;
  abstract removeContainer(id: string, force: boolean): Promise<void>;
  abstract containerLogs(id: string, tail: number): Promise<string>;

  abstract listNetworks(): Promise<Network[]>;
  abstract createNetwork(request: CreateNetwork): Promise<{ id: string }>;
  abstract removeNetwork(id: string): Promise<void>;
  abstract connectNetwork(networkId: string, containerId: string): Promise<void>;
  abstract disconnectNetwork(networkId: string, containerId: string): Promise<void>;

  abstract listImages(): Promise<Image[]>;
  abstract pullImage(reference: string): Promise<void>;
  abstract pullImageIfMissing(reference: string): Promise<void>;
  abstract removeImage(id: string, force: boolean): Promise<void>;

  abstract listVolumes(): Promise<Volume[]>;
  abstract createVolume(name: string): Promise<void>;
  abstract removeVolume(name: string): Promise<void>;
}
