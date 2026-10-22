import type { CreateSwarmServiceInput, SwarmTask } from "@nautix/contracts";

/** A change drawn on the canvas but not applied yet. */
export interface PlannedCreate {
  kind: "create";
  /** Stable key for the drawing (the service has no id yet). */
  key: string;
  spec: CreateSwarmServiceInput & { name: string; image: string };
  /** Overlay network it was dropped on, by name; the canvas draws it there. */
  network: string | null;
  /** The template asked for volumes that a service created from here cannot have yet. */
  droppedVolumes: boolean;
}

export interface PlannedScale {
  kind: "scale";
  serviceId: string;
  name: string;
  from: number;
  to: number;
}

export type PlanItem = PlannedCreate | PlannedScale;

export interface PlanIo {
  create: (spec: PlannedCreate["spec"]) => Promise<string>;
  scale: (serviceId: string, replicas: number) => Promise<void>;
  remove: (serviceId: string) => Promise<void>;
  tasks: (serviceId: string) => Promise<SwarmTask[]>;
  sleep: (ms: number) => Promise<void>;
}

export interface PlanOptions {
  timeoutMs: number;
  intervalMs: number;
  onStep?: (item: PlanItem, phase: "start" | "waiting" | "done") => void;
}

export interface PlanResult {
  ok: boolean;
  done: PlanItem[];
  failed?: { item: PlanItem; error: string };
  rolledBack: PlanItem[];
  rollbackErrors: { item: PlanItem; error: string }[];
}

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Two tasks that were refused or failed on the same service means it is not going to start by itself. */
const FAILED = new Set(["failed", "rejected"]);

/**
 * Waits until a service has the copies it should (like `docker service create` does) and returns
 * why it did not, or null when it did. Swarm keeps the history of replaced tasks, so only the ones
 * the cluster still wants running count as copies.
 */
export const waitConverged = async (
  io: Pick<PlanIo, "tasks" | "sleep">,
  serviceId: string,
  desired: number,
  opts: Pick<PlanOptions, "timeoutMs" | "intervalMs">,
): Promise<string | null> => {
  if (desired <= 0) return null;
  const rounds = Math.max(1, Math.ceil(opts.timeoutMs / opts.intervalMs));
  let last = "no tasks yet";
  for (let i = 0; i < rounds; i++) {
    const tasks = await io.tasks(serviceId);
    const current = tasks.filter((t) => t.desiredState === "running");
    if (current.filter((t) => t.state === "running").length >= desired) return null;
    const failed = tasks.filter((t) => FAILED.has(t.state));
    if (failed.length >= 2) {
      const reason = failed.find((t) => t.error)?.error ?? failed[0]?.state ?? "failed";
      return `${failed.length} tasks failed: ${reason}`;
    }
    last = current.map((t) => t.state).join(", ") || last;
    await io.sleep(opts.intervalMs);
  }
  return `did not start in time (${last})`;
};

const desiredCopies = (item: PlanItem): number =>
  item.kind === "create" ? (item.spec.global ? 1 : (item.spec.replicas ?? 1)) : item.to;

/**
 * Applies the plan one change at a time. When one fails, the ones already done are undone in reverse
 * order (a created service is removed, a scaled one goes back to its previous count), so the cluster is
 * left as it was. Nothing is removed that this plan did not create.
 */
export const applyPlan = async (
  items: PlanItem[],
  io: PlanIo,
  opts: PlanOptions,
): Promise<PlanResult> => {
  const done: PlanItem[] = [];
  const createdIds = new Map<PlanItem, string>();
  const undo = async (
    list: PlanItem[],
  ): Promise<Pick<PlanResult, "rolledBack" | "rollbackErrors">> => {
    const rolledBack: PlanItem[] = [];
    const rollbackErrors: PlanResult["rollbackErrors"] = [];
    for (const item of [...list].reverse()) {
      try {
        if (item.kind === "create") {
          const id = createdIds.get(item);
          if (id) await io.remove(id);
        } else {
          await io.scale(item.serviceId, item.from);
        }
        rolledBack.push(item);
      } catch (e) {
        rollbackErrors.push({ item, error: message(e) });
      }
    }
    return { rolledBack, rollbackErrors };
  };

  for (const item of items) {
    opts.onStep?.(item, "start");
    let error: string | null = null;
    try {
      if (item.kind === "create") createdIds.set(item, await io.create(item.spec));
      else await io.scale(item.serviceId, item.to);
      const id = item.kind === "create" ? createdIds.get(item) : item.serviceId;
      const wait = item.kind === "scale" && item.to <= item.from ? 0 : desiredCopies(item);
      if (id && wait > 0) {
        opts.onStep?.(item, "waiting");
        error = await waitConverged(io, id, wait, opts);
      }
    } catch (e) {
      error = message(e);
    }
    if (error !== null) {
      // The failing change is undone too: a created service that never started must not stay behind.
      const { rolledBack, rollbackErrors } = await undo([...done, item]);
      return { ok: false, done: [], failed: { item, error }, rolledBack, rollbackErrors };
    }
    done.push(item);
    opts.onStep?.(item, "done");
  }
  return { ok: true, done, rolledBack: [], rollbackErrors: [] };
};

/** The docker command a change stands for, shown before applying. */
export const planCommand = (item: PlanItem): string => {
  if (item.kind === "scale") return `docker service scale ${item.name}=${item.to}`;
  const { spec } = item;
  const parts = ["docker service create", `--name ${spec.name}`];
  parts.push(spec.global ? "--mode global" : `--replicas ${spec.replicas ?? 1}`);
  for (const n of spec.networks ?? []) parts.push(`--network ${n}`);
  for (const p of spec.ports ?? [])
    parts.push(
      `--publish ${p.published ?? p.target}:${p.target}${p.protocol === "udp" ? "/udp" : ""}`,
    );
  for (const k of Object.keys(spec.env ?? {})) parts.push(`--env ${k}=…`);
  parts.push(spec.image);
  return parts.join(" ");
};

/** The services that exist after the plan, by name: a second plan item cannot reuse a planned name. */
export const plannedNames = (items: PlanItem[]): string[] =>
  items.flatMap((i) => (i.kind === "create" ? [i.spec.name] : []));
