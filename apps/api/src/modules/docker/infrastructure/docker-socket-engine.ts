import { type IncomingMessage, request } from "node:http";
import type {
  Container,
  ContainerAction,
  ContainerDetails,
  ContainerState,
  CreateNetwork,
  EngineInfo,
  Image,
  Network,
  Volume,
} from "@nautix/contracts";
import { Injectable } from "@nestjs/common";
import {
  ConflictError,
  DomainError,
  EngineUnavailableError,
  NotFoundError,
  ValidationError,
} from "../../../shared/domain-error.js";
import { DockerEngine, type EngineEventKind } from "../application/ports/docker-engine.js";
import type { EngineContainerSpec } from "../domain/container-spec.js";
import { demuxStdcopy, isMultiplexed } from "./stdcopy.js";

interface Reply {
  status: number;
  body: Buffer;
}

const ACTION_PATH: Record<ContainerAction, string> = {
  start: "start",
  stop: "stop",
  restart: "restart",
  kill: "kill",
  pause: "pause",
  unpause: "unpause",
};

/** Talks to the Docker Engine API over the unix socket (no shell, no CLI). */
@Injectable()
export class DockerSocketEngine extends DockerEngine {
  constructor(private readonly socketPath: string) {
    super();
  }

  private call(method: string, path: string, body?: unknown): Promise<Reply> {
    return new Promise((resolve, reject) => {
      const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body));
      const req = request(
        {
          socketPath: this.socketPath,
          path: `/v1.43${path}`,
          method,
          headers: payload
            ? { "Content-Type": "application/json", "Content-Length": payload.length }
            : {},
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c: Buffer) => chunks.push(c));
          res.on("end", () =>
            resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks) }),
          );
          res.on("error", reject);
        },
      );
      req.on("error", () =>
        reject(new EngineUnavailableError("docker daemon unreachable", "errors.engineUnavailable")),
      );
      if (payload) req.write(payload);
      req.end();
    });
  }

  private async json<T>(method: string, path: string, body?: unknown): Promise<T> {
    const reply = await this.call(method, path, body);
    this.assertOk(reply);
    return (reply.body.length ? JSON.parse(reply.body.toString("utf8")) : undefined) as T;
  }

  private async send(method: string, path: string, body?: unknown): Promise<void> {
    this.assertOk(await this.call(method, path, body));
  }

  private assertOk({ status, body }: Reply): void {
    if (status >= 200 && status < 300) return;
    if (status === 304) return; // already started/stopped
    let message = `engine error ${status}`;
    try {
      message = (JSON.parse(body.toString("utf8")) as { message?: string }).message ?? message;
    } catch {
      /* keep default */
    }
    if (status === 404) throw new NotFoundError(message, "errors.notFound");
    if (status === 409) throw new ConflictError(message, this.conflictHint(message));
    if (status === 400) throw new ValidationError(message);
    throw new EngineUnavailableError(message);
  }

  private conflictHint(message: string): string {
    if (/port is already allocated|address already in use/i.test(message))
      return "errors.portInUse";
    if (/name .* is already in use/i.test(message)) return "errors.nameInUse";
    if (/in use|active endpoints|being used/i.test(message)) return "errors.inUse";
    return "errors.conflict";
  }

  /** Streams `/events`, reconnecting with backoff (250 ms → 8 s) until aborted. */
  async *events(signal: AbortSignal): AsyncIterable<EngineEventKind> {
    let delay = 250;
    while (!signal.aborted) {
      try {
        for await (const kind of this.eventStream(signal)) {
          delay = 250;
          yield kind;
        }
      } catch {
        /* daemon unreachable: retry below */
      }
      if (signal.aborted) return;
      yield "container"; // after a gap, tell clients to refetch everything
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(delay * 2, 8000);
    }
  }

  private async *eventStream(signal: AbortSignal): AsyncIterable<EngineEventKind> {
    const filters = encodeURIComponent(
      JSON.stringify({ type: ["container", "network", "image", "volume"] }),
    );
    const res = await new Promise<IncomingMessage>((resolve, reject) => {
      const req = request(
        {
          socketPath: this.socketPath,
          path: `/v1.43/events?filters=${filters}`,
          method: "GET",
          signal,
        },
        resolve,
      );
      req.on("error", reject);
      req.end();
    });
    let buffered = "";
    for await (const chunk of res) {
      buffered += (chunk as Buffer).toString("utf8");
      const lines = buffered.split("\n");
      buffered = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const type = (JSON.parse(line) as { Type?: string }).Type;
        if (type === "container" || type === "network" || type === "image" || type === "volume")
          yield type;
      }
    }
  }

  async info(): Promise<EngineInfo> {
    try {
      const i = await this.json<{
        ServerVersion: string;
        OperatingSystem: string;
        Containers: number;
        ContainersRunning: number;
        Images: number;
      }>("GET", "/info");
      return {
        connected: true,
        engine: "socket",
        version: i.ServerVersion,
        os: i.OperatingSystem,
        containers: i.Containers,
        running: i.ContainersRunning,
        images: i.Images,
      };
    } catch (error) {
      if (error instanceof DomainError) {
        return {
          connected: false,
          engine: "socket",
          version: null,
          os: null,
          containers: 0,
          running: 0,
          images: 0,
        };
      }
      throw error;
    }
  }

  async listContainers(): Promise<Container[]> {
    const rows = await this.json<
      {
        Id: string;
        Names: string[];
        Image: string;
        State: string;
        Status: string;
        Created: number;
        Ports: { IP?: string; PrivatePort: number; PublicPort?: number; Type: string }[];
        Labels: Record<string, string> | null;
        NetworkSettings?: { Networks?: Record<string, unknown> };
      }[]
    >("GET", "/containers/json?all=true");
    return rows.map((r) => ({
      id: r.Id,
      name: (r.Names[0] ?? r.Id).replace(/^\//, ""),
      image: r.Image,
      state: r.State as ContainerState,
      status: r.Status,
      createdAt: r.Created,
      ports: r.Ports.map((p) => ({
        ...(p.IP ? { ip: p.IP } : {}),
        privatePort: p.PrivatePort,
        ...(p.PublicPort ? { publicPort: p.PublicPort } : {}),
        type: p.Type,
      })),
      networks: Object.keys(r.NetworkSettings?.Networks ?? {}),
      labels: r.Labels ?? {},
    }));
  }

  async inspectContainers(ids: string[]): Promise<ContainerDetails[]> {
    return Promise.all(
      ids.map(async (id) => {
        const c = await this.json<{
          Id: string;
          Name: string;
          Config: { Image: string; Env: string[] | null; Cmd: string[] | null };
          HostConfig: { RestartPolicy?: { Name?: string } };
          Mounts?: {
            Type: string;
            Name?: string;
            Source: string;
            Destination: string;
            RW: boolean;
          }[];
        }>("GET", `/containers/${encodeURIComponent(id)}/json`);
        const image = await this.json<{
          Config?: { Env?: string[] | null; Cmd?: string[] | null };
        }>("GET", `/images/${encodeURIComponent(c.Config.Image)}/json`).catch(() => ({
          Config: undefined,
        }));
        const defaults = new Set(image.Config?.Env ?? []);
        const env = Object.fromEntries(
          (c.Config.Env ?? [])
            .filter((e) => !defaults.has(e))
            .map((e) => {
              const eq = e.indexOf("=");
              return [e.slice(0, eq), e.slice(eq + 1)] as const;
            }),
        );
        const sameCmd = JSON.stringify(c.Config.Cmd) === JSON.stringify(image.Config?.Cmd ?? null);
        return {
          id: c.Id,
          name: c.Name.replace(/^\//, ""),
          image: c.Config.Image,
          env,
          command: sameCmd ? null : c.Config.Cmd,
          restartPolicy: c.HostConfig.RestartPolicy?.Name || "no",
          mounts: (c.Mounts ?? []).flatMap((m) =>
            m.Type === "volume" || m.Type === "bind" || m.Type === "tmpfs"
              ? [
                  {
                    type: m.Type,
                    source: m.Type === "volume" ? (m.Name ?? m.Source) : m.Source,
                    target: m.Destination,
                    readOnly: !m.RW,
                  },
                ]
              : [],
          ),
        };
      }),
    );
  }

  async createContainer(spec: EngineContainerSpec): Promise<{ id: string }> {
    const created = await this.json<{ Id: string }>(
      "POST",
      `/containers/create?name=${encodeURIComponent(spec.name)}`,
      {
        Image: spec.image,
        Env: spec.env,
        Labels: spec.labels,
        ...(spec.cmd ? { Cmd: spec.cmd } : {}),
        ExposedPorts: spec.exposedPorts,
        HostConfig: {
          PortBindings: spec.portBindings,
          Binds: spec.binds,
          RestartPolicy: { Name: spec.restartPolicy },
          ...(spec.networkName ? { NetworkMode: spec.networkName } : {}),
        },
      },
    );
    return { id: created.Id };
  }

  containerAction(id: string, action: ContainerAction): Promise<void> {
    return this.send("POST", `/containers/${encodeURIComponent(id)}/${ACTION_PATH[action]}`);
  }

  removeContainer(id: string, force: boolean): Promise<void> {
    return this.send("DELETE", `/containers/${encodeURIComponent(id)}?force=${force}`);
  }

  async containerLogs(id: string, tail: number): Promise<string> {
    const reply = await this.call(
      "GET",
      `/containers/${encodeURIComponent(id)}/logs?stdout=true&stderr=true&timestamps=true&tail=${tail}`,
    );
    this.assertOk(reply);
    return isMultiplexed(reply.body) ? demuxStdcopy(reply.body) : reply.body.toString("utf8");
  }

  async listNetworks(): Promise<Network[]> {
    const rows = await this.json<
      {
        Id: string;
        Name: string;
        Driver: string;
        Internal: boolean;
        IPAM?: { Config?: { Subnet?: string }[] };
        Containers?: Record<string, unknown>;
      }[]
    >("GET", "/networks");
    return rows.map((n) => ({
      id: n.Id,
      name: n.Name,
      driver: n.Driver,
      internal: n.Internal,
      subnet: n.IPAM?.Config?.[0]?.Subnet ?? null,
      containerIds: Object.keys(n.Containers ?? {}),
      system: ["bridge", "host", "none"].includes(n.Name),
    }));
  }

  async createNetwork(request: CreateNetwork): Promise<{ id: string }> {
    const created = await this.json<{ Id: string }>("POST", "/networks/create", {
      Name: request.name,
      Driver: "bridge",
      Internal: request.internal,
      Labels: { "nautix.managed": "true" },
      ...(request.subnet ? { IPAM: { Config: [{ Subnet: request.subnet }] } } : {}),
    });
    return { id: created.Id };
  }

  removeNetwork(id: string): Promise<void> {
    return this.send("DELETE", `/networks/${encodeURIComponent(id)}`);
  }

  connectNetwork(networkId: string, containerId: string): Promise<void> {
    return this.send("POST", `/networks/${encodeURIComponent(networkId)}/connect`, {
      Container: containerId,
    });
  }

  disconnectNetwork(networkId: string, containerId: string): Promise<void> {
    return this.send("POST", `/networks/${encodeURIComponent(networkId)}/disconnect`, {
      Container: containerId,
    });
  }

  async listImages(): Promise<Image[]> {
    const [rows, containers] = await Promise.all([
      this.json<{ Id: string; RepoTags: string[] | null; Size: number; Created: number }[]>(
        "GET",
        "/images/json",
      ),
      this.json<{ ImageID: string }[]>("GET", "/containers/json?all=true"),
    ]);
    const used = new Set(containers.map((c) => c.ImageID));
    return rows.map((i) => ({
      id: i.Id,
      tags: i.RepoTags ?? [],
      size: i.Size,
      createdAt: i.Created,
      inUse: used.has(i.Id),
    }));
  }

  async pullImage(reference: string): Promise<void> {
    const sep = reference.lastIndexOf(":");
    const hasTag = sep > reference.lastIndexOf("/");
    const from = hasTag ? reference.slice(0, sep) : reference;
    const tag = hasTag ? reference.slice(sep + 1) : "latest";
    const reply = await this.call(
      "POST",
      `/images/create?fromImage=${encodeURIComponent(from)}&tag=${encodeURIComponent(tag)}`,
    );
    this.assertOk(reply);
    for (const line of reply.body.toString("utf8").split("\n")) {
      if (!line.trim()) continue;
      const parsed = JSON.parse(line) as { error?: string };
      if (parsed.error) throw new NotFoundError(parsed.error, "errors.imagePullFailed");
    }
  }

  async pullImageIfMissing(reference: string): Promise<void> {
    const probe = await this.call("GET", `/images/${encodeURI(reference)}/json`);
    if (probe.status === 200) return;
    await this.pullImage(reference);
  }

  removeImage(id: string, force: boolean): Promise<void> {
    return this.send("DELETE", `/images/${encodeURIComponent(id)}?force=${force}`);
  }

  async listVolumes(): Promise<Volume[]> {
    const [vols, containers] = await Promise.all([
      this.json<{
        Volumes: { Name: string; Driver: string; Mountpoint: string; CreatedAt?: string }[] | null;
      }>("GET", "/volumes"),
      this.json<{ Mounts: { Name?: string }[] }[]>("GET", "/containers/json?all=true"),
    ]);
    const used = new Set(containers.flatMap((c) => c.Mounts.map((m) => m.Name).filter(Boolean)));
    return (vols.Volumes ?? []).map((v) => ({
      name: v.Name,
      driver: v.Driver,
      mountpoint: v.Mountpoint,
      createdAt: v.CreatedAt ?? null,
      inUse: used.has(v.Name),
    }));
  }

  async createVolume(name: string): Promise<void> {
    await this.json("POST", "/volumes/create", {
      Name: name,
      Labels: { "nautix.managed": "true" },
    });
  }

  removeVolume(name: string): Promise<void> {
    return this.send("DELETE", `/volumes/${encodeURIComponent(name)}`);
  }
}
