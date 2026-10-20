import { randomBytes } from "node:crypto";
import { EventEmitter, on } from "node:events";
import { Readable } from "node:stream";
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
import { Injectable } from "@nestjs/common";
import { ConflictError, NotFoundError, ValidationError } from "../../../shared/domain-error.js";
import {
  type ActionOptions,
  type BuildOptions,
  DockerEngine,
  type EngineEventKind,
  type InspectKind,
} from "../application/ports/docker-engine.js";
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
  /** Fixed addresses by container id, then network name. */
  private fixedIps = new Map<string, Record<string, string>>();
  private images = new Map<string, Image>();
  private volumes = new Map<string, Volume>();
  private logs = new Map<string, string>();
  private env = new Map<string, Record<string, string>>();
  private restart = new Map<string, string>();
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

  /** Demo addresses: inside the network's subnet, stable per container. */
  private ipsOf(c: Container): Record<string, string> {
    if (c.state !== "running") return {};
    const last = 2 + (Number.parseInt(c.id.slice(0, 2), 16) % 250);
    return Object.fromEntries(
      c.networks.map((name) => {
        const fixed = this.fixedIps.get(c.id)?.[name];
        if (fixed) return [name, fixed];
        const subnet = [...this.networks.values()].find((n) => n.name === name)?.subnet;
        const prefix = (subnet ?? "172.17.0.0/16").split(".").slice(0, 3);
        return [name, `${prefix[0]}.${prefix[1]}.${subnet ? prefix[2] : "0"}.${last}`];
      }),
    );
  }

  async listContainers(): Promise<Container[]> {
    return [...this.containers.values()].map((c) => ({
      ...structuredClone(c),
      ips: this.ipsOf(c),
    }));
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
    if (target && spec.ipv4Address) this.fixedIps.set(id, { [target.name]: spec.ipv4Address });
    this.logs.set(id, "");
    this.env.set(
      id,
      Object.fromEntries(
        spec.env.map((e) => [e.slice(0, e.indexOf("=")), e.slice(e.indexOf("=") + 1)]),
      ),
    );
    return { id };
  }

  async containerAction(
    id: string,
    action: ContainerAction,
    _options: ActionOptions = {},
  ): Promise<void> {
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
    if (action === "start" && c.image.startsWith("curlimages/curl")) {
      // One-shot helper: finishes immediately and prints what Kong would answer.
      c.state = "exited";
      c.status = "Exited (0) just now";
      this.logs.set(id, '{"services":{},"routes":{}}');
    }
    this.logs.set(id, `${this.logs.get(id) ?? ""}${new Date().toISOString()} ${action}\n`);
  }

  async inspect(kind: InspectKind, id: string): Promise<unknown> {
    if (kind === "container") {
      const c = this.container(id);
      return {
        Id: c.id,
        Name: `/${c.name}`,
        State: { Status: c.state },
        Config: {
          Image: c.image,
          Env: Object.entries(this.env.get(id) ?? {}).map(([k, v]) => `${k}=${v}`),
          Labels: c.labels,
        },
        HostConfig: { RestartPolicy: { Name: this.restart.get(id) ?? "unless-stopped" } },
        NetworkSettings: {
          Networks: Object.fromEntries(
            c.networks.map((n) => [n, { IPAddress: this.ipsOf(c)[n] ?? "" }]),
          ),
        },
      };
    }
    if (kind === "network") {
      const n = this.networks.get(id) ?? [...this.networks.values()].find((x) => x.name === id);
      if (!n) throw new NotFoundError("network not found", "errors.notFound");
      return { Id: n.id, Name: n.name, Driver: n.driver, Internal: n.internal };
    }
    if (kind === "volume") {
      const v = this.volumes.get(id);
      if (!v) throw new NotFoundError("volume not found", "errors.notFound");
      return { Name: v.name, Driver: v.driver, Mountpoint: v.mountpoint };
    }
    const img = [...this.images.values()].find((i) => i.id === id || i.tags.includes(id));
    if (!img) throw new NotFoundError("image not found", "errors.notFound");
    return { Id: img.id, RepoTags: img.tags, Size: img.size };
  }

  async containerStats(id: string): Promise<ContainerStats> {
    this.container(id);
    const seed = [...id].reduce((n, ch) => n + ch.charCodeAt(0), 0);
    return {
      cpuPercent: (seed % 400) / 100,
      memoryBytes: (50 + (seed % 200)) * 1024 * 1024,
      memoryLimitBytes: 1024 * 1024 * 1024,
      networkRxBytes: seed * 1000,
      networkTxBytes: seed * 500,
      pids: 3 + (seed % 10),
    };
  }

  async containerTop(id: string): Promise<ContainerTop> {
    this.container(id);
    return {
      titles: ["PID", "USER", "COMMAND"],
      processes: [
        ["1", "root", "demo-init"],
        ["7", "app", "demo-server --port 80"],
      ],
    };
  }

  async containerDiff(id: string): Promise<FsChange[]> {
    this.container(id);
    return [
      { kind: "modified", path: "/etc/hosts" },
      { kind: "added", path: "/var/log/app.log" },
      { kind: "deleted", path: "/tmp/old.lock" },
    ];
  }

  async renameContainer(id: string, name: string): Promise<void> {
    const c = this.container(id);
    if ([...this.containers.values()].some((x) => x.name === name && x.id !== id)) {
      throw new ConflictError(`name ${name} is already in use`, "errors.nameInUse");
    }
    c.name = name;
    this.emit("container");
  }

  async updateContainer(id: string, update: UpdateContainer): Promise<void> {
    this.container(id);
    if (update.restartPolicy) this.restart.set(id, update.restartPolicy);
    this.emit("container");
  }

  async waitContainer(id: string, timeoutMs: number): Promise<WaitResult> {
    const c = this.container(id);
    if (c.state !== "running") return { exited: true, statusCode: 0 };
    await new Promise((resolve) => setTimeout(resolve, Math.min(timeoutMs, 200)));
    return { exited: false, statusCode: null };
  }

  async commitContainer(id: string, input: CommitContainer): Promise<{ id: string }> {
    const c = this.container(id);
    const ref = `${input.repository}:${input.tag}`;
    const imageId = `sha256:${newId()}`;
    this.images.set(ref, {
      id: imageId,
      tags: [ref],
      size: 60_000_000,
      createdAt: Math.floor(Date.now() / 1000),
      inUse: false,
    });
    this.logs.set(id, `${this.logs.get(id) ?? ""}committed ${c.name} as ${ref}\n`);
    this.emit("image");
    return { id: imageId };
  }

  async runCommand(
    id: string,
    command: string[],
  ): Promise<{ exitCode: number | null; output: string }> {
    this.container(id);
    if (command[0] === "ls")
      return {
        exitCode: 0,
        output:
          "total 8\n-rw-r--r--    1 root     root            18 Oct 20 12:00 hello.txt\ndrwxr-xr-x    2 root     root          4096 Oct 20 12:00 data/\n",
      };
    if (command[0] === "nslookup")
      return {
        exitCode: 0,
        output: `Server: 127.0.0.1\n\nName: ${command[1] ?? ""}\nAddress: 10.0.0.5`,
      };
    if (command[0] === "head") return { exitCode: 0, output: "hello from the volume\n" };
    return { exitCode: 0, output: `ran: ${command[0] ?? ""}` };
  }

  async exportContainer(id: string): Promise<Readable> {
    this.container(id);
    return Readable.from([Buffer.from(`FAKE-TAR export of ${id}`)]);
  }

  async getArchive(id: string, path: string): Promise<Readable> {
    this.container(id);
    return Readable.from([Buffer.from(`FAKE-TAR ${path}`)]);
  }

  async putArchive(id: string, _path: string, tar: Readable): Promise<void> {
    this.container(id);
    for await (const _chunk of tar) {
      /* discard */
    }
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

  async containerLogs(id: string, tail: number, _sinceSeconds?: number): Promise<string> {
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

  async connectNetwork(
    networkId: string,
    containerId: string,
    ipv4Address?: string,
  ): Promise<void> {
    this.emit("network");
    this.emit("container");
    this.attach(networkId, containerId);
    const name = this.networks.get(networkId)?.name;
    if (name && ipv4Address)
      this.fixedIps.set(containerId, { ...this.fixedIps.get(containerId), [name]: ipv4Address });
  }

  async disconnectNetwork(networkId: string, containerId: string): Promise<void> {
    this.emit("network");
    this.emit("container");
    const net = this.networks.get(networkId);
    const c = this.container(containerId);
    if (!net) throw new NotFoundError("network not found", "errors.notFound");
    net.members.delete(containerId);
    c.networks = c.networks.filter((n) => n !== net.name);
    const fixed = { ...this.fixedIps.get(containerId) };
    delete fixed[net.name];
    this.fixedIps.set(containerId, fixed);
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

  async imageTag(reference: string, repository: string, tag: string): Promise<void> {
    const src = [...this.images.values()].find(
      (i) => i.tags.includes(reference) || i.id === reference,
    );
    if (!src) throw new NotFoundError("image not found", "errors.notFound");
    const ref = `${repository}:${tag}`;
    if (!src.tags.includes(ref)) src.tags.push(ref);
    this.images.set(ref, src);
    this.emit("image");
  }

  async imageHistory(reference: string): Promise<ImageHistoryEntry[]> {
    const img = [...this.images.values()].find(
      (i) => i.tags.includes(reference) || i.id === reference,
    );
    if (!img) throw new NotFoundError("image not found", "errors.notFound");
    return [
      { id: img.id, createdAt: img.createdAt, createdBy: 'CMD ["demo"]', size: 0, tags: img.tags },
      {
        id: "<missing>",
        createdAt: img.createdAt,
        createdBy: "ADD rootfs.tar / # buildkit",
        size: img.size,
        tags: [],
      },
    ];
  }

  async saveImages(references: string[]): Promise<Readable> {
    for (const r of references) await this.imageHistory(r);
    return Readable.from([Buffer.from(`FAKE-IMAGE-TAR ${references.join(",")}`)]);
  }

  async loadImages(tar: Readable): Promise<string> {
    for await (const _chunk of tar) {
      /* discard */
    }
    await this.pullImage("loaded/image:latest");
    return "Loaded image: loaded/image:latest";
  }

  async importImage(tar: Readable, repository: string, tag: string): Promise<string> {
    for await (const _chunk of tar) {
      /* discard */
    }
    await this.pullImage(`${repository}:${tag}`);
    return `sha256:${newId()}`;
  }

  async searchImages(term: string, limit: number): Promise<ImageSearchResult[]> {
    const catalog = [
      { name: "nginx", description: "Official build of Nginx.", stars: 20000, official: true },
      {
        name: "redis",
        description: "Redis is the world's fastest data platform.",
        stars: 13000,
        official: true,
      },
      {
        name: "bitnami/nginx",
        description: "Bitnami container image for NGINX",
        stars: 150,
        official: false,
      },
    ];
    return catalog.filter((c) => c.name.includes(term.toLowerCase())).slice(0, limit);
  }

  async *buildImage(context: Buffer, options: BuildOptions): AsyncIterable<string> {
    if (context.includes("BROKEN-STEP"))
      throw new ValidationError(
        "The command '/bin/sh -c BROKEN-STEP' returned a non-zero code: 127",
        "errors.buildFailed",
      );
    yield "Step 1/2 : FROM alpine:3.20";
    yield " ---> demo";
    yield 'Step 2/2 : CMD ["sh"]';
    const ref = options.tag.includes(":") ? options.tag : `${options.tag}:latest`;
    this.images.set(ref, {
      id: `sha256:${newId()}`,
      tags: [ref],
      size: 7_000_000,
      createdAt: Math.floor(Date.now() / 1000),
      inUse: false,
    });
    this.emit("image");
    yield `Successfully tagged ${ref}`;
  }

  async pushImage(reference: string, auth: RegistryAuth | undefined): Promise<string> {
    await this.imageHistory(reference);
    if (reference.startsWith("private/") && !auth)
      throw new ValidationError("authentication required", "errors.pushFailed");
    return `The push refers to repository [${reference}]\nlatest: digest: sha256:demo size: 1234`;
  }

  async testRegistryAuth(auth: RegistryAuth): Promise<string> {
    if (auth.password === "wrong")
      throw new ValidationError("registry login failed", "errors.loginFailed");
    return "Login Succeeded";
  }

  async rawInfo(): Promise<unknown> {
    return {
      ServerVersion: "demo",
      OperatingSystem: "Nautix demo engine",
      Containers: this.containers.size,
      Images: this.images.size,
      Driver: "overlay2",
      NCPU: 4,
      MemTotal: 8 * 1024 ** 3,
    };
  }

  async version(): Promise<unknown> {
    return { Version: "demo", ApiVersion: "1.43", Os: "linux", Arch: "amd64", GoVersion: "demo" };
  }

  async diskUsage(): Promise<DiskUsage> {
    const images = [...this.images.values()];
    const used = new Set([...this.containers.values()].map((c) => c.image));
    const containers = [...this.containers.values()];
    return {
      images: {
        count: images.length,
        active: images.filter((i) => i.tags.some((t) => used.has(t))).length,
        sizeBytes: images.reduce((n, i) => n + i.size, 0),
        reclaimableBytes: images
          .filter((i) => !i.tags.some((t) => used.has(t)))
          .reduce((n, i) => n + i.size, 0),
      },
      containers: {
        count: containers.length,
        active: containers.filter((c) => c.state === "running").length,
        sizeBytes: containers.length * 1024,
        reclaimableBytes: containers.filter((c) => c.state !== "running").length * 1024,
      },
      volumes: {
        count: this.volumes.size,
        active: 0,
        sizeBytes: this.volumes.size * 2048,
        reclaimableBytes: this.volumes.size * 2048,
      },
      buildCache: { count: 0, active: 0, sizeBytes: 0, reclaimableBytes: 0 },
    };
  }

  async prune(kind: PruneKind, all: boolean): Promise<PruneResult> {
    let deleted = 0;
    let reclaimedBytes = 0;
    if (kind === "containers") {
      for (const c of [...this.containers.values()]) {
        if (
          ["exited", "created", "dead"].includes(c.state) &&
          !c.labels["nautix.self"] &&
          c.name !== "nautix"
        ) {
          this.containers.delete(c.id);
          for (const n of this.networks.values()) n.members.delete(c.id);
          deleted++;
        }
      }
      this.emit("container");
    } else if (kind === "images") {
      const used = new Set([...this.containers.values()].map((c) => c.image));
      for (const [key, i] of [...this.images.entries()]) {
        const unused = !i.tags.some((t) => used.has(t));
        if (unused && (i.tags.length === 0 || all)) {
          this.images.delete(key);
          deleted++;
          reclaimedBytes += i.size;
        }
      }
      this.emit("image");
    } else if (kind === "volumes") {
      for (const [name, v] of [...this.volumes.entries()]) {
        if (!v.inUse) {
          this.volumes.delete(name);
          deleted++;
        }
      }
      this.emit("volume");
    } else {
      for (const [id, n] of [...this.networks.entries()]) {
        if (!n.system && n.members.size === 0) {
          this.networks.delete(id);
          deleted++;
        }
      }
      this.emit("network");
    }
    return { deleted, reclaimedBytes };
  }

  async *detailedEvents(signal: AbortSignal): AsyncIterable<EngineEvent> {
    try {
      for await (const [kind] of on(this.bus, "change", { signal })) {
        yield {
          time: Math.floor(Date.now() / 1000),
          type: String(kind),
          action: "change",
          id: "demo",
          name: null,
        };
      }
    } catch (error) {
      if (!signal.aborted) throw error;
    }
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
