import { randomBytes } from "node:crypto";
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
import { ConflictError, NotFoundError, ValidationError } from "../../../shared/domain-error.js";
import { setFakeSwarmRole } from "../../../shared/fake-swarm-role.js";
import { SwarmEngine } from "../application/ports/swarm-engine.js";
import { scheduleTasks } from "../domain/schedule.js";

const id = (): string => randomBytes(12).toString("hex");
const now = (): string => new Date().toISOString();

interface FakeItem extends SwarmItem {
  value: string;
}

interface FakeService extends SwarmService {
  env: Record<string, string>;
  /** What an update replaced, so a rollback can put it back. */
  previous?: Pick<SwarmService, "image" | "networks" | "placement">;
}

/** In-memory swarm for the demo engine and tests. */
/** Images containing this text never start in the demo engine. */
const FAILING_IMAGE = "demo-fail";

export class FakeSwarmEngine extends SwarmEngine {
  private active = false;
  private locked = false;
  private autolock = false;
  private nodeList: SwarmNode[] = [];
  private serviceList = new Map<string, FakeService>();
  private secretList = new Map<string, FakeItem>();
  private configList = new Map<string, FakeItem>();
  private tokens = { worker: `SWMTKN-1-worker-${id()}`, manager: `SWMTKN-1-manager-${id()}` };
  private key = `SWMKEY-1-${id()}`;

  private manager(): void {
    if (!this.active)
      throw new ConflictError("This node is not a swarm manager", "errors.notSwarmManager");
  }

  async status(): Promise<SwarmStatus> {
    return {
      active: this.active,
      nodeId: this.nodeList[0]?.id ?? null,
      isManager: this.active,
      managers: this.nodeList.filter((n) => n.role === "manager").length,
      nodes: this.nodeList.length,
      nodeAddr: this.active ? "127.0.0.1" : null,
      clusterId: this.active ? "demo-cluster" : null,
      locked: this.locked,
    };
  }

  async init(advertiseAddr: string | undefined): Promise<string> {
    if (this.active) throw new ConflictError("already part of a swarm", "errors.swarmActive");
    this.active = true;
    const node: SwarmNode = {
      id: id(),
      hostname: "demo-node",
      role: "manager",
      availability: "active",
      state: "ready",
      address: advertiseAddr ?? "127.0.0.1",
      leader: true,
      engineVersion: "demo",
    };
    this.nodeList = [node];
    // Demo only: more nodes make the cluster view worth looking at (default is the single node).
    const extra = Math.max(0, Math.min(8, Number(process.env.NAUTIX_FAKE_SWARM_NODES ?? 1) - 1));
    for (let i = 0; i < extra; i++)
      this.nodeList.push({
        ...node,
        id: id(),
        hostname: `demo-node-${i + 2}`,
        role: "worker",
        leader: false,
        address: `127.0.0.${i + 2}`,
      });
    setFakeSwarmRole("manager");
    return node.id;
  }

  async join(): Promise<void> {
    throw new ValidationError(
      "joining another swarm is not available in the demo engine",
      "errors.swarmRejected",
    );
  }

  async leave(force: boolean): Promise<void> {
    this.manager();
    if (!force && this.nodeList.length === 1 && this.serviceList.size > 0)
      throw new ConflictError("this is the last manager; use force", "errors.swarmLastManager");
    this.active = false;
    this.nodeList = [];
    this.serviceList.clear();
    setFakeSwarmRole("none");
  }

  async joinTokens(): Promise<{ worker: string; manager: string }> {
    this.manager();
    return this.tokens;
  }

  async rotateToken(target: "worker" | "manager"): Promise<void> {
    this.manager();
    this.tokens = { ...this.tokens, [target]: `SWMTKN-1-${target}-${id()}` };
  }

  async setAutolock(enabled: boolean): Promise<void> {
    this.manager();
    this.autolock = enabled;
  }

  async unlockKey(): Promise<string> {
    this.manager();
    if (!this.autolock) throw new ValidationError("autolock is off", "errors.swarmRejected");
    return this.key;
  }

  async unlock(key: string): Promise<void> {
    if (key !== this.key) throw new ValidationError("wrong unlock key", "errors.swarmRejected");
    this.locked = false;
  }

  async nodes(): Promise<SwarmNode[]> {
    this.manager();
    return this.nodeList;
  }

  async updateNode(nodeId: string, patch: UpdateSwarmNode): Promise<void> {
    this.manager();
    const node = this.nodeList.find((n) => n.id === nodeId);
    if (!node) throw new NotFoundError("node not found", "errors.notFound");
    Object.assign(node, patch);
  }

  async removeNode(nodeId: string, force: boolean): Promise<void> {
    this.manager();
    const node = this.nodeList.find((n) => n.id === nodeId);
    if (!node) throw new NotFoundError("node not found", "errors.notFound");
    if (node.state === "ready" && !force)
      throw new ConflictError("node is ready; drain it or use force", "errors.conflict");
    this.nodeList = this.nodeList.filter((n) => n.id !== nodeId);
  }

  async services(): Promise<SwarmService[]> {
    this.manager();
    return [...this.serviceList.values()].map(({ env: _env, previous: _previous, ...s }) => s);
  }

  private service(serviceId: string) {
    const s =
      this.serviceList.get(serviceId) ??
      [...this.serviceList.values()].find((x) => x.name === serviceId);
    if (!s) throw new NotFoundError("service not found", "errors.notFound");
    return s;
  }

  async tasks(serviceId: string): Promise<SwarmTask[]> {
    this.manager();
    const s = this.service(serviceId);
    return this.tasksOf(s);
  }

  /** Where the copies go (see `scheduleTasks`); a copy that finds no node stays pending. */
  private place(s: FakeService) {
    return scheduleTasks(this.nodeList, s.placement, s.mode, s.desired);
  }

  /** Keeps the numbers the UI reads (copies running) in step with the placement. */
  private refresh(s: FakeService): void {
    const failing = s.image.includes(FAILING_IMAGE);
    const sched = this.place(s);
    s.running = failing ? 0 : sched.nodeIds.length;
    if (s.mode === "global") s.desired = sched.nodeIds.length;
  }

  private tasksOf(s: FakeService): ClusterTask[] {
    // Demo: an image named like this never starts, to show the plan undoing a failed change.
    if (s.image.includes(FAILING_IMAGE))
      return [1, 2].map((slot) => ({
        id: id(),
        slot: 1,
        nodeId: this.nodeList[0]?.id ?? "",
        state: slot === 1 ? "rejected" : "failed",
        desiredState: "shutdown",
        error: `No such image: ${s.image}`,
        image: s.image,
        updatedAt: now(),
        serviceId: s.id,
      }));
    const sched = this.place(s);
    const base = { desiredState: "running", image: s.image, updatedAt: now(), serviceId: s.id };
    return [
      ...sched.nodeIds.map((nodeId, i) => ({
        ...base,
        id: id(),
        slot: i + 1,
        nodeId,
        state: "running",
        error: "",
      })),
      ...Array.from({ length: sched.unplaced }, (_, i) => ({
        ...base,
        id: id(),
        slot: sched.nodeIds.length + i + 1,
        nodeId: "",
        state: "pending",
        error: sched.reason,
      })),
    ];
  }

  async allTasks(): Promise<ClusterTask[]> {
    this.manager();
    return [...this.serviceList.values()].flatMap((s) => this.tasksOf(s));
  }

  async serviceEnv(serviceId: string): Promise<Record<string, string>> {
    this.manager();
    return { ...this.service(serviceId).env };
  }

  async serviceLogs(serviceId: string): Promise<string> {
    this.manager();
    return `${now()} ${this.service(serviceId).name}.1 | started (demo)\n`;
  }

  async createService(request: CreateSwarmService): Promise<{ id: string }> {
    this.manager();
    if ([...this.serviceList.values()].some((s) => s.name === request.name))
      throw new ConflictError(`name ${request.name} is already in use`, "errors.nameInUse");
    const known = new Set([...this.secretList.values()].map((i) => i.name));
    for (const name of request.secrets)
      if (!known.has(name))
        throw new ValidationError(`secret ${name} does not exist`, "errors.secretNotFound");
    const serviceId = id();
    const service: FakeService = {
      id: serviceId,
      name: request.name,
      image: request.image,
      mode: request.global ? "global" : "replicated",
      replicas: request.global ? null : request.replicas,
      running: 0,
      desired: request.global ? 0 : request.replicas,
      ports: request.ports,
      stack: null,
      networks: request.networks,
      mounts: request.mounts,
      placement: request.placement,
      secrets: request.secrets,
      update: { state: null, message: "", startedAt: "" },
      updatedAt: now(),
      env: request.env,
    };
    this.refresh(service);
    this.serviceList.set(serviceId, service);
    return { id: serviceId };
  }

  async updateService(serviceId: string, patch: UpdateSwarmService): Promise<void> {
    this.manager();
    const s = this.service(serviceId);
    const rollsOut =
      patch.image !== undefined ||
      patch.networks !== undefined ||
      patch.placement !== undefined ||
      patch.env !== undefined;
    if (rollsOut) {
      if (patch.image?.includes(FAILING_IMAGE)) {
        // Docker's own failure action: the new copies never start, so the update goes back by itself.
        s.update = {
          state: "rollback_completed",
          message: `update rolled back: No such image: ${patch.image}`,
          startedAt: now(),
        };
        s.updatedAt = now();
        return;
      }
      s.previous = { image: s.image, networks: s.networks, placement: s.placement };
      if (patch.image) s.image = patch.image;
      if (patch.networks)
        s.networks = [
          ...s.networks.filter((n) => !patch.networks?.remove.includes(n)),
          ...patch.networks.add.filter((n) => !s.networks.includes(n)),
        ];
      if (patch.placement) s.placement = patch.placement;
      if (patch.env) {
        for (const key of patch.env.unset) delete s.env[key];
        Object.assign(s.env, patch.env.set);
      }
      s.update = { state: "completed", message: "update completed", startedAt: now() };
    }
    if (patch.replicas !== undefined && s.mode === "replicated") {
      s.replicas = patch.replicas;
      s.desired = patch.replicas;
    }
    this.refresh(s);
    s.updatedAt = now();
  }

  async rollbackService(serviceId: string): Promise<void> {
    this.manager();
    const s = this.service(serviceId);
    if (!s.previous)
      throw new ConflictError("there is nothing to roll back to", "errors.nothingToRollBack");
    Object.assign(s, s.previous);
    s.previous = undefined;
    s.update = { state: "rollback_completed", message: "rollback completed", startedAt: now() };
    this.refresh(s);
    s.updatedAt = now();
  }

  async removeService(serviceId: string): Promise<void> {
    this.manager();
    this.serviceList.delete(this.service(serviceId).id);
  }

  private items(map: Map<string, FakeItem>): SwarmItem[] {
    this.manager();
    return [...map.values()].map(({ value: _value, ...i }) => i);
  }

  private add(map: Map<string, FakeItem>, name: string, value: string): void {
    this.manager();
    if ([...map.values()].some((i) => i.name === name))
      throw new ConflictError(`name ${name} is already in use`, "errors.nameInUse");
    const itemId = id();
    map.set(itemId, { id: itemId, name, createdAt: now(), value });
  }

  private drop(map: Map<string, FakeItem>, itemId: string): void {
    this.manager();
    if (!map.delete(itemId)) throw new NotFoundError("not found", "errors.notFound");
  }

  async secrets(): Promise<SwarmItem[]> {
    return this.items(this.secretList);
  }
  async createSecret(name: string, value: string): Promise<void> {
    this.add(this.secretList, name, value);
  }
  async removeSecret(itemId: string): Promise<void> {
    this.drop(this.secretList, itemId);
  }
  async configs(): Promise<SwarmItem[]> {
    return this.items(this.configList);
  }
  async configData(itemId: string): Promise<string> {
    this.manager();
    const c = this.configList.get(itemId);
    if (!c) throw new NotFoundError("not found", "errors.notFound");
    return c.value;
  }
  async createConfig(name: string, value: string): Promise<void> {
    this.add(this.configList, name, value);
  }
  async removeConfig(itemId: string): Promise<void> {
    this.drop(this.configList, itemId);
  }
}
