import { randomBytes } from "node:crypto";
import { EventEmitter, on } from "node:events";
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
import { Injectable } from "@nestjs/common";
import { ConflictError, NotFoundError } from "../../../shared/domain-error.js";
import { DockerEngine, type EngineEventKind } from "../application/ports/docker-engine.js";
import type { EngineContainerSpec } from "../domain/container-spec.js";

const newId = (): string => randomBytes(32).toString("hex");

interface FakeNetwork extends Omit<Network, "containerIds"> {
  members: Set<string>;
}

/** In-memory engine for demo mode (NAUTIX_ENGINE=fake), unit tests and e2e. */
@Injectable()
export class FakeDockerEngine extends DockerEngine {
  private containers = new Map<string, Container>();
  private networks = new Map<string, FakeNetwork>();
  private images = new Map<string, Image>();
  private volumes = new Map<string, Volume>();
  private logs = new Map<string, string>();
  private env = new Map<string, Record<string, string>>();
  private readonly bus = new EventEmitter();

  private emit(kind: EngineEventKind): void {
    // Deferred so subscribers refetch after the mutation has completed.
    setTimeout(() => this.bus.emit("change", kind), 0);
  }

  async *events(signal: AbortSignal): AsyncIterable<EngineEventKind> {
    try {
      for await (const [kind] of on(this.bus, "change", { signal })) yield kind as EngineEventKind;
    } catch (error) {
      if (!signal.aborted) throw error;
    }
  }

  constructor(seed = true) {
    super();
    const bridge = this.addNetwork("bridge", false, null, true);
    this.addNetwork("host", false, null, true);
    this.addNetwork("none", true, null, true);
    if (!seed) return;
    const edge = this.addNetwork("edge", false, "172.30.0.0/24", false);
    const backend = this.addNetwork("backend", true, "172.31.0.0/24", false);
    this.seedContainer("traefik", "traefik:v3.1", [edge.id, backend.id], [80]);
    this.seedContainer("kong", "kong:3.7", [backend.id], [8000]);
    this.seedContainer("postgres", "postgres:16-alpine", [backend.id], []);
    this.seedContainer("nautix", "ghcr.io/patterna-dev/nautix:latest", [bridge.id], []);
    this.seedContainer("standalone", "nginx:1.27-alpine", [bridge.id], [80]);
  }

  private addNetwork(
    name: string,
    internal: boolean,
    subnet: string | null,
    system: boolean,
  ): FakeNetwork {
    const net: FakeNetwork = {
      id: newId(),
      name,
      driver: "bridge",
      internal,
      subnet,
      system,
      members: new Set(),
    };
    this.networks.set(net.id, net);
    return net;
  }

  private seedContainer(name: string, image: string, networkIds: string[], ports: number[]): void {
    const id = newId();
    this.containers.set(id, {
      id,
      name,
      image,
      state: "running",
      status: "Up 2 hours",
      createdAt: Math.floor(Date.now() / 1000) - 7200,
      ports: ports.map((p) => ({
        ip: "127.0.0.1",
        privatePort: p,
        publicPort: p + 8000,
        type: "tcp",
      })),
      networks: [],
      labels: { "nautix.managed": "true" },
    });
    this.images.set(image, {
      id: `sha256:${newId()}`,
      tags: [image],
      size: 80_000_000,
      createdAt: 0,
      inUse: true,
    });
    for (const n of networkIds) this.attach(n, id);
    this.logs.set(id, `${new Date().toISOString()} ${name} started\n`);
  }

  private attach(networkId: string, containerId: string): void {
    const net = this.networks.get(networkId);
    const container = this.containers.get(containerId);
    if (!net || !container) throw new NotFoundError("not found", "errors.notFound");
    net.members.add(containerId);
    if (!container.networks.includes(net.name)) container.networks.push(net.name);
  }

  private container(id: string): Container {
    const c = this.containers.get(id);
    if (!c) throw new NotFoundError("container not found", "errors.notFound");
    return c;
  }

  async info(): Promise<EngineInfo> {
    const all = [...this.containers.values()];
    return {
      connected: true,
      engine: "fake",
      version: "demo",
      os: "Nautix demo engine",
      containers: all.length,
      running: all.filter((c) => c.state === "running").length,
      images: this.images.size,
    };
  }

  async listContainers(): Promise<Container[]> {
    return [...this.containers.values()].map((c) => structuredClone(c));
  }

  async inspectContainers(ids: string[]): Promise<ContainerDetails[]> {
    return ids.map((id) => {
      const c = this.container(id);
      return {
        id,
        name: c.name,
        image: c.image,
        env: this.env.get(id) ?? {},
        command: null,
        restartPolicy: "unless-stopped",
        mounts: [],
      };
    });
  }

  async createContainer(spec: EngineContainerSpec): Promise<{ id: string }> {
    if ([...this.containers.values()].some((c) => c.name === spec.name)) {
      throw new ConflictError(`name ${spec.name} is already in use`, "errors.nameInUse");
    }
    const id = newId();
    this.containers.set(id, {
      id,
      name: spec.name,
      image: spec.image,
      state: "created",
      status: "Created",
      createdAt: Math.floor(Date.now() / 1000),
      ports: Object.entries(spec.portBindings).flatMap(([key, bindings]) =>
        bindings.map((b) => ({
          ip: b.HostIp,
          privatePort: Number(key.split("/")[0]),
          publicPort: Number(b.HostPort) || 32768,
          type: key.split("/")[1] ?? "tcp",
        })),
      ),
      networks: [],
      labels: spec.labels,
    });
    const target = spec.networkName
      ? [...this.networks.values()].find((n) => n.name === spec.networkName)
      : [...this.networks.values()].find((n) => n.name === "bridge");
    if (target) this.attach(target.id, id);
    this.logs.set(id, "");
    this.env.set(
      id,
      Object.fromEntries(
        spec.env.map((e) => [e.slice(0, e.indexOf("=")), e.slice(e.indexOf("=") + 1)]),
      ),
    );
    return { id };
  }

  async containerAction(id: string, action: ContainerAction): Promise<void> {
    this.emit("container");
    const c = this.container(id);
    const next: Record<ContainerAction, [Container["state"], string]> = {
      start: ["running", "Up less than a second"],
      restart: ["running", "Up less than a second"],
      unpause: ["running", "Up 1 second"],
      pause: ["paused", "Up (Paused)"],
      stop: ["exited", "Exited (0) just now"],
      kill: ["exited", "Exited (137) just now"],
    };
    const [state, status] = next[action];
    c.state = state;
    c.status = status;
    this.logs.set(id, `${this.logs.get(id) ?? ""}${new Date().toISOString()} ${action}\n`);
  }

  async removeContainer(id: string, force: boolean): Promise<void> {
    this.emit("container");
    const c = this.container(id);
    if (c.state === "running" && !force) {
      throw new ConflictError("container is running", "errors.inUse");
    }
    for (const n of this.networks.values()) n.members.delete(id);
    this.containers.delete(id);
  }

  async containerLogs(id: string, tail: number): Promise<string> {
    this.container(id);
    return (this.logs.get(id) ?? "")
      .split("\n")
      .slice(-tail - 1)
      .join("\n");
  }

  async listNetworks(): Promise<Network[]> {
    return [...this.networks.values()].map(({ members, ...n }) => ({
      ...n,
      containerIds: [...members],
    }));
  }

  async createNetwork(request: CreateNetwork): Promise<{ id: string }> {
    if ([...this.networks.values()].some((n) => n.name === request.name)) {
      throw new ConflictError("network name in use", "errors.nameInUse");
    }
    return {
      id: this.addNetwork(request.name, request.internal, request.subnet ?? null, false).id,
    };
  }

  async removeNetwork(id: string): Promise<void> {
    this.emit("network");
    const net = this.networks.get(id);
    if (!net) throw new NotFoundError("network not found", "errors.notFound");
    if (net.members.size > 0)
      throw new ConflictError("network has active endpoints", "errors.inUse");
    this.networks.delete(id);
  }

  async connectNetwork(networkId: string, containerId: string): Promise<void> {
    this.emit("network");
    this.emit("container");
    this.attach(networkId, containerId);
  }

  async disconnectNetwork(networkId: string, containerId: string): Promise<void> {
    this.emit("network");
    this.emit("container");
    const net = this.networks.get(networkId);
    const c = this.container(containerId);
    if (!net) throw new NotFoundError("network not found", "errors.notFound");
    net.members.delete(containerId);
    c.networks = c.networks.filter((n) => n !== net.name);
  }

  async listImages(): Promise<Image[]> {
    const used = new Set([...this.containers.values()].map((c) => c.image));
    return [...this.images.values()].map((i) => ({ ...i, inUse: i.tags.some((t) => used.has(t)) }));
  }

  async pullImage(reference: string): Promise<void> {
    this.emit("image");
    const ref = reference.includes(":") ? reference : `${reference}:latest`;
    this.images.set(ref, {
      id: `sha256:${newId()}`,
      tags: [ref],
      size: 50_000_000,
      createdAt: Math.floor(Date.now() / 1000),
      inUse: false,
    });
  }

  async pullImageIfMissing(reference: string): Promise<void> {
    if (![...this.images.values()].some((i) => i.tags.includes(reference)))
      await this.pullImage(reference);
  }

  async removeImage(id: string, _force: boolean): Promise<void> {
    this.emit("image");
    const key = [...this.images.entries()].find(([, i]) => i.id === id)?.[0];
    if (!key) throw new NotFoundError("image not found", "errors.notFound");
    this.images.delete(key);
  }

  async listVolumes(): Promise<Volume[]> {
    return [...this.volumes.values()];
  }

  async createVolume(name: string): Promise<void> {
    this.emit("volume");
    this.volumes.set(name, {
      name,
      driver: "local",
      mountpoint: `/var/lib/docker/volumes/${name}/_data`,
      createdAt: new Date().toISOString(),
      inUse: false,
    });
  }

  async removeVolume(name: string): Promise<void> {
    this.emit("volume");
    if (!this.volumes.delete(name)) throw new NotFoundError("volume not found", "errors.notFound");
  }
}
