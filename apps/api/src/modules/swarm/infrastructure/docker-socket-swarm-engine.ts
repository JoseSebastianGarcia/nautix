import type {
  ClusterTask,
  CreateSwarmService,
  SwarmItem,
  SwarmNode,
  SwarmService,
  SwarmStatus,
  SwarmTask,
  UpdateSwarmNode,
  UpdateSwarmService,
} from "@nautix/contracts";
import { ValidationError } from "../../../shared/domain-error.js";
import { EngineHttp } from "../../../shared/engine-http.js";
import { demuxStdcopy, isMultiplexed } from "../../docker/infrastructure/stdcopy.js";
import { SwarmEngine } from "../application/ports/swarm-engine.js";
import {
  envMap,
  fromClusterTask,
  fromNode,
  fromService,
  fromTask,
  patchServiceSpec,
  type RawNode,
  type RawService,
  type RawTask,
  toServiceSpec,
} from "../domain/swarm-spec.js";

interface RawSwarm {
  ID: string;
  Version: { Index: number };
  Spec: Record<string, unknown> & { EncryptionConfig?: { AutoLockManagers?: boolean } };
  JoinTokens: { Worker: string; Manager: string };
}

interface RawItem {
  ID: string;
  CreatedAt: string;
  Spec: { Name: string; Data?: string };
}

const toItem = (i: RawItem): SwarmItem => ({ id: i.ID, name: i.Spec.Name, createdAt: i.CreatedAt });

export class DockerSocketSwarmEngine extends SwarmEngine {
  private readonly http: EngineHttp;

  constructor(socketPath: string) {
    super();
    this.http = new EngineHttp(socketPath);
  }

  async status(): Promise<SwarmStatus> {
    const info = await this.http.json<{
      Swarm?: {
        NodeID?: string;
        NodeAddr?: string;
        LocalNodeState?: string;
        ControlAvailable?: boolean;
        Nodes?: number;
        Managers?: number;
        Cluster?: { ID?: string };
      };
    }>("GET", "/info");
    const s = info.Swarm ?? {};
    const state = s.LocalNodeState ?? "inactive";
    return {
      active: state === "active" || state === "pending" || state === "locked",
      nodeId: s.NodeID || null,
      isManager: s.ControlAvailable === true,
      managers: s.Managers ?? 0,
      nodes: s.Nodes ?? 0,
      nodeAddr: s.NodeAddr || null,
      clusterId: s.Cluster?.ID ?? null,
      locked: state === "locked",
    };
  }

  init(advertiseAddr: string | undefined): Promise<string> {
    return this.http.json<string>("POST", "/swarm/init", {
      ListenAddr: "0.0.0.0:2377",
      ...(advertiseAddr ? { AdvertiseAddr: advertiseAddr } : {}),
    });
  }

  join(remoteAddr: string, token: string, advertiseAddr: string | undefined): Promise<void> {
    return this.http.send("POST", "/swarm/join", {
      ListenAddr: "0.0.0.0:2377",
      ...(advertiseAddr ? { AdvertiseAddr: advertiseAddr } : {}),
      RemoteAddrs: [remoteAddr],
      JoinToken: token,
    });
  }

  leave(force: boolean): Promise<void> {
    return this.http.send("POST", `/swarm/leave?force=${force}`);
  }

  private swarm(): Promise<RawSwarm> {
    return this.http.json<RawSwarm>("GET", "/swarm");
  }

  async joinTokens(): Promise<{ worker: string; manager: string }> {
    const s = await this.swarm();
    return { worker: s.JoinTokens.Worker, manager: s.JoinTokens.Manager };
  }

  async rotateToken(target: "worker" | "manager"): Promise<void> {
    const s = await this.swarm();
    const flag = target === "worker" ? "rotateWorkerToken" : "rotateManagerToken";
    await this.http.send("POST", `/swarm/update?version=${s.Version.Index}&${flag}=true`, s.Spec);
  }

  async setAutolock(enabled: boolean): Promise<void> {
    const s = await this.swarm();
    const spec = { ...s.Spec, EncryptionConfig: { AutoLockManagers: enabled } };
    await this.http.send("POST", `/swarm/update?version=${s.Version.Index}`, spec);
  }

  async unlockKey(): Promise<string> {
    return (await this.http.json<{ UnlockKey: string }>("GET", "/swarm/unlockkey")).UnlockKey;
  }

  unlock(key: string): Promise<void> {
    return this.http.send("POST", "/swarm/unlock", { UnlockKey: key });
  }

  async nodes(): Promise<SwarmNode[]> {
    return (await this.http.json<RawNode[]>("GET", "/nodes")).map(fromNode);
  }

  async updateNode(id: string, patch: UpdateSwarmNode): Promise<void> {
    const node = await this.http.json<RawNode>("GET", `/nodes/${encodeURIComponent(id)}`);
    const spec = {
      ...node.Spec,
      ...(patch.role ? { Role: patch.role } : {}),
      ...(patch.availability ? { Availability: patch.availability } : {}),
    };
    await this.http.send(
      "POST",
      `/nodes/${encodeURIComponent(id)}/update?version=${node.Version?.Index ?? 0}`,
      spec,
    );
  }

  removeNode(id: string, force: boolean): Promise<void> {
    return this.http.send("DELETE", `/nodes/${encodeURIComponent(id)}?force=${force}`);
  }

  async services(): Promise<SwarmService[]> {
    return (await this.http.json<RawService[]>("GET", "/services?status=true")).map(fromService);
  }

  async tasks(serviceId: string): Promise<SwarmTask[]> {
    const filters = encodeURIComponent(JSON.stringify({ service: [serviceId] }));
    const rows = await this.http.json<RawTask[]>("GET", `/tasks?filters=${filters}`);
    return rows.map(fromTask).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async allTasks(): Promise<ClusterTask[]> {
    const rows = await this.http.json<RawTask[]>("GET", "/tasks");
    return rows.map(fromClusterTask);
  }

  async serviceEnv(id: string): Promise<Record<string, string>> {
    const service = await this.http.json<RawService>("GET", `/services/${encodeURIComponent(id)}`);
    return envMap(service.Spec);
  }

  async serviceLogs(serviceId: string, tail: number): Promise<string> {
    const reply = await this.http.call(
      "GET",
      `/services/${encodeURIComponent(serviceId)}/logs?stdout=true&stderr=true&timestamps=true&tail=${tail}`,
    );
    this.http.assertOk(reply);
    return isMultiplexed(reply.body) ? demuxStdcopy(reply.body) : reply.body.toString("utf8");
  }

  async createService(request: CreateSwarmService): Promise<{ id: string }> {
    // Secrets are chosen by name; the engine wants their ids.
    const secretIds: Record<string, string> = {};
    if (request.secrets.length > 0) {
      const known = new Map((await this.secrets()).map((s) => [s.name, s.id]));
      for (const name of request.secrets) {
        const found = known.get(name);
        if (!found)
          throw new ValidationError(`secret ${name} does not exist`, "errors.secretNotFound");
        secretIds[name] = found;
      }
    }
    const created = await this.http.json<{ ID: string }>(
      "POST",
      "/services/create",
      toServiceSpec(request, secretIds),
    );
    return { id: created.ID };
  }

  async rollbackService(id: string): Promise<void> {
    const service = await this.http.json<RawService>("GET", `/services/${encodeURIComponent(id)}`);
    await this.http.send(
      "POST",
      `/services/${encodeURIComponent(id)}/update?version=${service.Version?.Index ?? 0}&rollback=previous`,
      service.Spec,
    );
  }

  async updateService(id: string, patch: UpdateSwarmService): Promise<void> {
    const service = await this.http.json<RawService>("GET", `/services/${encodeURIComponent(id)}`);
    // A service may name a network by id (the CLI does) or by name (Nautix does): resolve both ways.
    const networkIds: Record<string, string> = {};
    if (patch.networks)
      for (const n of await this.http.json<{ Id: string; Name: string }[]>("GET", "/networks"))
        networkIds[n.Name] = n.Id;
    await this.http.send(
      "POST",
      `/services/${encodeURIComponent(id)}/update?version=${service.Version?.Index ?? 0}`,
      patchServiceSpec(service.Spec, patch, networkIds),
    );
  }

  removeService(id: string): Promise<void> {
    return this.http.send("DELETE", `/services/${encodeURIComponent(id)}`);
  }

  async secrets(): Promise<SwarmItem[]> {
    return (await this.http.json<RawItem[]>("GET", "/secrets")).map(toItem);
  }

  createSecret(name: string, value: string): Promise<void> {
    return this.http.send("POST", "/secrets/create", {
      Name: name,
      Data: Buffer.from(value, "utf8").toString("base64"),
    });
  }

  removeSecret(id: string): Promise<void> {
    return this.http.send("DELETE", `/secrets/${encodeURIComponent(id)}`);
  }

  async configs(): Promise<SwarmItem[]> {
    return (await this.http.json<RawItem[]>("GET", "/configs")).map(toItem);
  }

  async configData(id: string): Promise<string> {
    const item = await this.http.json<RawItem>("GET", `/configs/${encodeURIComponent(id)}`);
    return Buffer.from(item.Spec.Data ?? "", "base64").toString("utf8");
  }

  createConfig(name: string, value: string): Promise<void> {
    return this.http.send("POST", "/configs/create", {
      Name: name,
      Data: Buffer.from(value, "utf8").toString("base64"),
    });
  }

  removeConfig(id: string): Promise<void> {
    return this.http.send("DELETE", `/configs/${encodeURIComponent(id)}`);
  }
}
