import type { Readable } from "node:stream";
import type {
  CommitContainer,
  Container,
  ContainerAction,
  ContainerDetails,
  ContainerStats,
  ContainerTop,
  CreateNetwork,
  DiskUsage,
  EngineEvent,
  EngineInfo,
  FsChange,
  Image,
  ImageHistoryEntry,
  ImageSearchResult,
  Network,
  PruneKind,
  PruneResult,
  RegistryAuth,
  UpdateContainer,
  Volume,
  WaitResult,
} from "@nautix/contracts";
import type { EngineContainerSpec } from "../../domain/container-spec.js";

export type InspectKind = "container" | "image" | "volume" | "network";

export interface ActionOptions {
  /** kill: signal name, e.g. SIGTERM. */
  signal?: string;
  /** stop/restart: seconds to wait before SIGKILL. */
  timeoutSeconds?: number;
}

export type EngineEventKind = "container" | "network" | "image" | "volume";

/** Port to the Docker engine. Adapters: DockerSocketEngine (real), FakeDockerEngine (demo/tests). */
export abstract class DockerEngine {
  abstract info(): Promise<EngineInfo>;
  /** Stream of "something of this kind changed" events; ends when the signal aborts. */
  abstract events(signal: AbortSignal): AsyncIterable<EngineEventKind>;

  abstract listContainers(): Promise<Container[]>;
  abstract inspectContainers(ids: string[]): Promise<ContainerDetails[]>;
  abstract createContainer(spec: EngineContainerSpec): Promise<{ id: string }>;
  abstract containerAction(
    id: string,
    action: ContainerAction,
    options?: ActionOptions,
  ): Promise<void>;
  abstract inspect(kind: InspectKind, id: string): Promise<unknown>;
  abstract containerStats(id: string): Promise<ContainerStats>;
  abstract containerTop(id: string): Promise<ContainerTop>;
  abstract containerDiff(id: string): Promise<FsChange[]>;
  abstract renameContainer(id: string, name: string): Promise<void>;
  abstract updateContainer(id: string, update: UpdateContainer): Promise<void>;
  /** Blocks until the container exits or `timeoutMs` passes. */
  abstract waitContainer(id: string, timeoutMs: number): Promise<WaitResult>;
  abstract commitContainer(id: string, input: CommitContainer): Promise<{ id: string }>;
  abstract exportContainer(id: string): Promise<Readable>;
  /** One-shot, non-interactive command inside a running container (no TTY, no stdin). */
  abstract runCommand(
    id: string,
    command: string[],
    timeoutMs: number,
  ): Promise<{ exitCode: number | null; output: string }>;
  abstract getArchive(id: string, path: string): Promise<Readable>;
  abstract putArchive(id: string, path: string, tar: Readable): Promise<void>;
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

  abstract imageTag(reference: string, repository: string, tag: string): Promise<void>;
  abstract imageHistory(reference: string): Promise<ImageHistoryEntry[]>;
  abstract saveImages(references: string[]): Promise<Readable>;
  abstract loadImages(tar: Readable): Promise<string>;
  abstract importImage(tar: Readable, repository: string, tag: string): Promise<string>;
  abstract searchImages(term: string, limit: number): Promise<ImageSearchResult[]>;
  /** Credentials are used for this call only. Returns the engine's progress lines. */
  abstract pushImage(reference: string, auth: RegistryAuth | undefined): Promise<string>;
  abstract testRegistryAuth(auth: RegistryAuth): Promise<string>;

  abstract rawInfo(): Promise<unknown>;
  abstract version(): Promise<unknown>;
  abstract diskUsage(): Promise<DiskUsage>;
  abstract prune(kind: PruneKind, all: boolean): Promise<PruneResult>;
  /** Detailed engine events (unlike `events`, which only says what kind of thing changed). */
  abstract detailedEvents(signal: AbortSignal): AsyncIterable<EngineEvent>;

  abstract listVolumes(): Promise<Volume[]>;
  abstract createVolume(name: string): Promise<void>;
  abstract removeVolume(name: string): Promise<void>;
}
