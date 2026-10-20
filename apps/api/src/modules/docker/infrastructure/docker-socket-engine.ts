import { type IncomingMessage, request } from "node:http";
import { Readable } from "node:stream";
import type {
  CommitContainer,
  Container,
  ContainerAction,
  ContainerDetails,
  ContainerState,
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
import {
  ConflictError,
  DomainError,
  EngineUnavailableError,
  NotFoundError,
  ValidationError,
} from "../../../shared/domain-error.js";
import {
  type ActionOptions,
  type BuildOptions,
  DockerEngine,
  type EngineEventKind,
  type InspectKind,
} from "../application/ports/docker-engine.js";
import type { EngineContainerSpec } from "../domain/container-spec.js";
import { computeStats } from "../domain/container-stats.js";
import { summarizeDf } from "../domain/disk-usage.js";
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

  private call(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders: Record<string, string> = {},
  ): Promise<Reply> {
    return new Promise((resolve, reject) => {
      const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body));
      const req = request(
        {
          socketPath: this.socketPath,
          path: `/v1.43${path}`,
          method,
          headers: {
            ...(payload
              ? { "Content-Type": "application/json", "Content-Length": payload.length }
              : {}),
            ...extraHeaders,
          },
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

  containerAction(id: string, action: ContainerAction, options: ActionOptions = {}): Promise<void> {
    const query =
      action === "kill" && options.signal
        ? `?signal=${encodeURIComponent(options.signal)}`
        : (action === "stop" || action === "restart") && options.timeoutSeconds !== undefined
          ? `?t=${Math.trunc(options.timeoutSeconds)}`
          : "";
    return this.send(
      "POST",
      `/containers/${encodeURIComponent(id)}/${ACTION_PATH[action]}${query}`,
    );
  }

  inspect(kind: InspectKind, id: string): Promise<unknown> {
    const base = {
      container: "containers",
      image: "images",
      volume: "volumes",
      network: "networks",
    }[kind];
    const suffix = kind === "container" || kind === "image" ? "/json" : "";
    return this.json("GET", `/${base}/${encodeURIComponent(id)}${suffix}`);
  }

  async containerStats(id: string): Promise<ContainerStats> {
    // stream=false waits for two samples (~1 s) so the CPU delta is meaningful.
    return computeStats(
      await this.json("GET", `/containers/${encodeURIComponent(id)}/stats?stream=false`),
    );
  }

  async containerTop(id: string): Promise<ContainerTop> {
    const top = await this.json<{ Titles: string[]; Processes: string[][] | null }>(
      "GET",
      `/containers/${encodeURIComponent(id)}/top`,
    );
    return { titles: top.Titles, processes: top.Processes ?? [] };
  }

  async containerDiff(id: string): Promise<FsChange[]> {
    const rows = await this.json<{ Path: string; Kind: number }[] | null>(
      "GET",
      `/containers/${encodeURIComponent(id)}/changes`,
    );
    const kinds = ["modified", "added", "deleted"] as const;
    return (rows ?? []).map((r) => ({ kind: kinds[r.Kind] ?? "modified", path: r.Path }));
  }

  renameContainer(id: string, name: string): Promise<void> {
    return this.send(
      "POST",
      `/containers/${encodeURIComponent(id)}/rename?name=${encodeURIComponent(name)}`,
    );
  }

  updateContainer(id: string, update: UpdateContainer): Promise<void> {
    const body: Record<string, unknown> = {};
    if (update.restartPolicy) body.RestartPolicy = { Name: update.restartPolicy };
    if (update.memoryMb !== undefined) {
      const bytes = update.memoryMb * 1024 * 1024;
      body.Memory = bytes;
      body.MemorySwap = bytes === 0 ? -1 : bytes; // keep swap in step so the engine accepts the change
    }
    if (update.cpus !== undefined) body.NanoCpus = Math.round(update.cpus * 1e9);
    return this.send("POST", `/containers/${encodeURIComponent(id)}/update`, body);
  }

  waitContainer(id: string, timeoutMs: number): Promise<WaitResult> {
    return new Promise((resolve, reject) => {
      let timedOut = false;
      const req = request(
        {
          socketPath: this.socketPath,
          path: `/v1.43/containers/${encodeURIComponent(id)}/wait?condition=not-running`,
          method: "POST",
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c: Buffer) => chunks.push(c));
          res.on("end", () => {
            clearTimeout(timer);
            try {
              this.assertOk({ status: res.statusCode ?? 0, body: Buffer.concat(chunks) });
              const { StatusCode } = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
                StatusCode: number;
              };
              resolve({ exited: true, statusCode: StatusCode });
            } catch (error) {
              reject(error);
            }
          });
        },
      );
      const timer = setTimeout(() => {
        timedOut = true;
        req.destroy();
        resolve({ exited: false, statusCode: null });
      }, timeoutMs);
      req.on("error", () => {
        clearTimeout(timer);
        if (!timedOut)
          reject(
            new EngineUnavailableError("docker daemon unreachable", "errors.engineUnavailable"),
          );
      });
      req.end();
    });
  }

  async commitContainer(id: string, input: CommitContainer): Promise<{ id: string }> {
    const q = new URLSearchParams({
      container: id,
      repo: input.repository,
      tag: input.tag,
      pause: String(input.pause),
    });
    if (input.comment) q.set("comment", input.comment);
    const created = await this.json<{ Id: string }>("POST", `/commit?${q.toString()}`);
    return { id: created.Id };
  }

  /** Streams a response body (tar) without buffering; errors are mapped before the stream starts. */
  private stream(method: string, path: string, body?: Readable): Promise<IncomingMessage> {
    return new Promise((resolve, reject) => {
      const req = request(
        {
          socketPath: this.socketPath,
          path: `/v1.43${path}`,
          method,
          headers: body ? { "Content-Type": "application/x-tar" } : {},
        },
        (res) => {
          const status = res.statusCode ?? 0;
          if (status >= 200 && status < 300) return resolve(res);
          const chunks: Buffer[] = [];
          res.on("data", (c: Buffer) => chunks.push(c));
          res.on("end", () => {
            try {
              this.assertOk({ status, body: Buffer.concat(chunks) });
              reject(new EngineUnavailableError(`engine error ${status}`));
            } catch (error) {
              reject(error);
            }
          });
        },
      );
      req.on("error", () =>
        reject(new EngineUnavailableError("docker daemon unreachable", "errors.engineUnavailable")),
      );
      if (body) body.pipe(req);
      else req.end();
    });
  }

  async runCommand(
    id: string,
    command: string[],
    timeoutMs: number,
  ): Promise<{ exitCode: number | null; output: string }> {
    const created = await this.json<{ Id: string }>(
      "POST",
      `/containers/${encodeURIComponent(id)}/exec`,
      {
        AttachStdout: true,
        AttachStderr: true,
        Tty: false,
        Cmd: command,
      },
    );
    const run = (async () => {
      const reply = await this.call("POST", `/exec/${created.Id}/start`, {
        Detach: false,
        Tty: false,
      });
      this.assertOk(reply);
      const output = (
        isMultiplexed(reply.body) ? demuxStdcopy(reply.body) : reply.body.toString("utf8")
      ).slice(-8000);
      const info = await this.json<{ ExitCode: number | null }>("GET", `/exec/${created.Id}/json`);
      return { exitCode: info.ExitCode, output };
    })();
    const timeout = new Promise<{ exitCode: number | null; output: string }>((resolve) =>
      setTimeout(() => resolve({ exitCode: null, output: "timed out" }), timeoutMs),
    );
    return Promise.race([run, timeout]);
  }

  exportContainer(id: string): Promise<Readable> {
    return this.stream("GET", `/containers/${encodeURIComponent(id)}/export`);
  }

  getArchive(id: string, path: string): Promise<Readable> {
    return this.stream(
      "GET",
      `/containers/${encodeURIComponent(id)}/archive?path=${encodeURIComponent(path)}`,
    );
  }

  async putArchive(id: string, path: string, tar: Readable): Promise<void> {
    const res = await this.stream(
      "PUT",
      `/containers/${encodeURIComponent(id)}/archive?path=${encodeURIComponent(path)}`,
      tar,
    );
    res.resume();
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

  async pullImage(reference: string, auth?: RegistryAuth): Promise<void> {
    const sep = reference.lastIndexOf(":");
    const hasTag = sep > reference.lastIndexOf("/");
    const from = hasTag ? reference.slice(0, sep) : reference;
    const tag = hasTag ? reference.slice(sep + 1) : "latest";
    const reply = await this.call(
      "POST",
      `/images/create?fromImage=${encodeURIComponent(from)}&tag=${encodeURIComponent(tag)}`,
      undefined,
      auth ? this.authHeader(auth) : undefined,
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

  imageTag(reference: string, repository: string, tag: string): Promise<void> {
    return this.send(
      "POST",
      `/images/${encodeURI(reference)}/tag?repo=${encodeURIComponent(repository)}&tag=${encodeURIComponent(tag)}`,
    );
  }

  async imageHistory(reference: string): Promise<ImageHistoryEntry[]> {
    const rows = await this.json<
      { Id: string; Created: number; CreatedBy: string; Size: number; Tags: string[] | null }[]
    >("GET", `/images/${encodeURI(reference)}/history`);
    return rows.map((r) => ({
      id: r.Id,
      createdAt: r.Created,
      createdBy: r.CreatedBy,
      size: r.Size,
      tags: r.Tags ?? [],
    }));
  }

  saveImages(references: string[]): Promise<Readable> {
    const names = references.map((r) => `names=${encodeURIComponent(r)}`).join("&");
    return this.stream("GET", `/images/get?${names}`);
  }

  /** The load/import endpoints answer with JSON progress lines; keep the human-readable ones. */
  private async progressText(res: IncomingMessage): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of res) chunks.push(chunk as Buffer);
    const lines = Buffer.concat(chunks)
      .toString("utf8")
      .split("\n")
      .filter((l) => l.trim());
    const out: string[] = [];
    for (const line of lines) {
      let msg: { stream?: string; status?: string; error?: string; progress?: string; id?: string };
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      if (msg.error) throw new ValidationError(msg.error, "errors.imageOperationFailed");
      const text = msg.stream ?? [msg.id, msg.status].filter(Boolean).join(": ");
      if (text.trim() && !msg.progress) out.push(text.trim());
    }
    return out.slice(-20).join("\n");
  }

  async loadImages(tar: Readable): Promise<string> {
    return this.progressText(await this.stream("POST", "/images/load?quiet=false", tar));
  }

  async importImage(tar: Readable, repository: string, tag: string): Promise<string> {
    const q = `fromSrc=-&repo=${encodeURIComponent(repository)}&tag=${encodeURIComponent(tag)}`;
    return this.progressText(await this.stream("POST", `/images/create?${q}`, tar));
  }

  async searchImages(term: string, limit: number): Promise<ImageSearchResult[]> {
    const rows = await this.json<
      { name: string; description: string; star_count: number; is_official: boolean }[]
    >("GET", `/images/search?term=${encodeURIComponent(term)}&limit=${limit}`);
    return rows.map((r) => ({
      name: r.name,
      description: r.description,
      stars: r.star_count,
      official: r.is_official,
    }));
  }

  private authHeader(auth: RegistryAuth | undefined): Record<string, string> {
    const payload = auth
      ? {
          username: auth.username,
          password: auth.password,
          ...(auth.serveraddress ? { serveraddress: auth.serveraddress } : {}),
        }
      : {};
    return { "X-Registry-Auth": Buffer.from(JSON.stringify(payload)).toString("base64url") };
  }

  async *buildImage(context: Buffer, options: BuildOptions): AsyncIterable<string> {
    const q = new URLSearchParams({
      t: options.tag,
      rm: "1",
      forcerm: "1",
      dockerfile: "Dockerfile",
    });
    if (Object.keys(options.buildArgs).length)
      q.set("buildargs", JSON.stringify(options.buildArgs));
    if (options.target) q.set("target", options.target);
    if (options.noCache) q.set("nocache", "1");
    if (options.pull) q.set("pull", "1");
    const res = await this.stream("POST", `/build?${q.toString()}`, Readable.from([context]));
    let pending = "";
    for await (const chunk of res) {
      pending += (chunk as Buffer).toString("utf8");
      let nl = pending.indexOf("\n");
      while (nl >= 0) {
        const line = pending.slice(0, nl);
        pending = pending.slice(nl + 1);
        yield* this.buildLine(line);
        nl = pending.indexOf("\n");
      }
    }
    if (pending.trim()) yield* this.buildLine(pending);
  }

  private *buildLine(line: string): Iterable<string> {
    if (!line.trim()) return;
    let msg: { stream?: string; status?: string; error?: string; aux?: unknown };
    try {
      msg = JSON.parse(line);
    } catch {
      yield line;
      return;
    }
    if (msg.error) throw new ValidationError(msg.error, "errors.buildFailed");
    if (msg.stream) yield msg.stream.replace(/\n$/, "");
    else if (msg.status) yield msg.status;
  }

  async pushImage(reference: string, auth: RegistryAuth | undefined): Promise<string> {
    const sep = reference.lastIndexOf(":");
    const hasTag = sep > reference.lastIndexOf("/");
    const name = hasTag ? reference.slice(0, sep) : reference;
    const tag = hasTag ? reference.slice(sep + 1) : "latest";
    const reply = await this.call(
      "POST",
      `/images/${encodeURI(name)}/push?tag=${encodeURIComponent(tag)}`,
      undefined,
      this.authHeader(auth),
    );
    this.assertOk(reply);
    const out: string[] = [];
    for (const line of reply.body.toString("utf8").split("\n")) {
      if (!line.trim()) continue;
      const msg = JSON.parse(line) as {
        status?: string;
        error?: string;
        progress?: string;
        id?: string;
      };
      // Never echo anything that could contain the credentials back to the client.
      if (msg.error)
        throw new ValidationError(
          msg.error.replace(auth?.password ?? "\u0000", "***"),
          "errors.pushFailed",
        );
      if (msg.status && !msg.progress) out.push([msg.id, msg.status].filter(Boolean).join(": "));
    }
    return out.slice(-20).join("\n");
  }

  async testRegistryAuth(auth: RegistryAuth): Promise<string> {
    const reply = await this.call("POST", "/auth", {
      username: auth.username,
      password: auth.password,
      ...(auth.serveraddress ? { serveraddress: auth.serveraddress } : {}),
    });
    if (reply.status === 401 || reply.status === 403)
      throw new ValidationError("registry login failed", "errors.loginFailed");
    this.assertOk(reply);
    return (JSON.parse(reply.body.toString("utf8")) as { Status?: string }).Status ?? "OK";
  }

  rawInfo(): Promise<unknown> {
    return this.json("GET", "/info");
  }

  version(): Promise<unknown> {
    return this.json("GET", "/version");
  }

  async diskUsage(): Promise<DiskUsage> {
    return summarizeDf(await this.json("GET", "/system/df"));
  }

  async prune(kind: PruneKind, all: boolean): Promise<PruneResult> {
    const path = {
      containers: "/containers/prune",
      images: `/images/prune?filters=${encodeURIComponent(JSON.stringify({ dangling: [all ? "false" : "true"] }))}`,
      volumes: `/volumes/prune?filters=${encodeURIComponent(JSON.stringify({ all: [String(all)] }))}`,
      networks: "/networks/prune",
    }[kind];
    const r = await this.json<{
      ContainersDeleted?: string[] | null;
      ImagesDeleted?: unknown[] | null;
      VolumesDeleted?: string[] | null;
      NetworksDeleted?: string[] | null;
      SpaceReclaimed?: number;
    }>("POST", path);
    const deleted = (
      r.ContainersDeleted ??
      r.ImagesDeleted ??
      r.VolumesDeleted ??
      r.NetworksDeleted ??
      []
    ).length;
    return { deleted, reclaimedBytes: r.SpaceReclaimed ?? 0 };
  }

  async *detailedEvents(signal: AbortSignal): AsyncIterable<EngineEvent> {
    let delay = 250;
    while (!signal.aborted) {
      try {
        const res = await new Promise<IncomingMessage>((resolve, reject) => {
          const req = request(
            { socketPath: this.socketPath, path: "/v1.43/events", method: "GET", signal },
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
            const e = JSON.parse(line) as {
              time?: number;
              Type?: string;
              Action?: string;
              Actor?: { ID?: string; Attributes?: Record<string, string> };
            };
            delay = 250;
            yield {
              time: e.time ?? Math.floor(Date.now() / 1000),
              type: e.Type ?? "",
              action: e.Action ?? "",
              id: e.Actor?.ID ?? "",
              name: e.Actor?.Attributes?.name ?? null,
            };
          }
        }
      } catch {
        /* reconnect below */
      }
      if (signal.aborted) return;
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 2, 8000);
    }
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
