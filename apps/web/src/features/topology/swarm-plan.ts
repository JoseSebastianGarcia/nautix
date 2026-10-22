import type {
  BindingStyle,
  CreateSwarmBindingInput,
  CreateSwarmServiceInput,
  SwarmHealthcheck,
  SwarmMount,
  SwarmPlacement,
  SwarmPort,
  SwarmResources,
  SwarmService,
  SwarmTask,
  SwarmUpdatePolicy,
  UpdateSwarmService,
} from "@nautix/contracts";

/** A change drawn on the canvas but not applied yet. */
export interface PlannedCreate {
  kind: "create";
  /** Stable key for the drawing (the service has no id yet). */
  key: string;
  spec: CreateSwarmServiceInput & { name: string; image: string };
  /** Overlay network it was dropped on, by name; the canvas draws it there. */
  network: string | null;
}

export interface PlannedScale {
  kind: "scale";
  serviceId: string;
  name: string;
  from: number;
  to: number;
}

/** What an update can change. Each field comes with the value it replaces, so it can be put back. */
export interface UpdateFields {
  image?: { from: string; to: string };
  placement?: { from: SwarmPlacement; to: SwarmPlacement };
  /** Overlay networks to join and to leave, by name. */
  networks?: { add: string[]; remove: string[] };
  ports?: { from: SwarmPort[]; to: SwarmPort[] };
  /** Mounts to add and to take out (the full definition, so a removal can be put back). */
  mounts?: { add: SwarmMount[]; remove: SwarmMount[] };
  secrets?: { add: string[]; remove: string[] };
  configs?: { add: string[]; remove: string[] };
  /** Values stay in memory until applied; the engine never returns them, so an overwritten one cannot be restored by hand. */
  env?: { set: Record<string, string>; unset: string[] };
  healthcheck?: { from: SwarmHealthcheck | null; to: SwarmHealthcheck | null };
  resources?: { from: SwarmResources; to: SwarmResources };
  /** How future updates roll out: nothing is replaced when only this changes. */
  policy?: { from: Required<SwarmUpdatePolicy>; to: Required<SwarmUpdatePolicy> };
}

export interface PlannedUpdate {
  kind: "update";
  serviceId: string;
  name: string;
  changes: UpdateFields;
}

/** Applied last and not undoable: a removed service cannot be rebuilt, its settings are not readable back. */
export interface PlannedRemove {
  kind: "remove";
  serviceId: string;
  name: string;
}

/** Wires one service to another: the consumer gets the provider's connection settings. */
export interface PlannedBind {
  kind: "bind";
  key: string;
  consumer: { id: string; name: string };
  provider: { id: string; name: string };
  /** Names the variable (`ConnectionStrings__<name>`). */
  name: string;
  style: BindingStyle;
  /** What the preview said: the variables (names only) and the overlay it talks over. */
  variables: string[];
  network: string;
  joins: boolean;
}

/** Takes a binding's variables out of the consumer. It can be put back: the provider still has what it needs. */
export interface PlannedUnbind {
  kind: "unbind";
  bindingId: string;
  consumer: { id: string; name: string };
  provider: string;
  name: string;
  style: BindingStyle;
  variables: string[];
}

export type PlanItem =
  | PlannedCreate
  | PlannedScale
  | PlannedUpdate
  | PlannedRemove
  | PlannedBind
  | PlannedUnbind;

/** The id the service plan items refer to (the consumer, for the ones that change its environment). */
export const itemServiceId = (p: PlanItem): string | null =>
  p.kind === "create"
    ? null
    : p.kind === "bind" || p.kind === "unbind"
      ? p.consumer.id
      : p.serviceId;

export interface PlanIo {
  create: (spec: PlannedCreate["spec"]) => Promise<string>;
  update: (serviceId: string, patch: UpdateSwarmService) => Promise<void>;
  remove: (serviceId: string) => Promise<void>;
  /** Creates a binding and returns its id. */
  bind: (input: CreateSwarmBindingInput) => Promise<string>;
  unbind: (bindingId: string) => Promise<void>;
  /** Goes back to the spec before the service's last update. */
  rollback: (serviceId: string) => Promise<void>;
  tasks: (serviceId: string) => Promise<SwarmTask[]>;
  service: (serviceId: string) => Promise<SwarmService | undefined>;
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
  /** Services already removed when a later removal failed: they stay removed. */
  removed: PlanItem[];
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

const UPDATE_FAILED = new Set([
  "paused",
  "rollback_started",
  "rollback_paused",
  "rollback_completed",
]);

/**
 * Waits for the rolling update that began after `since` to finish. Docker undoes a failing update by
 * itself (the service's failure action), so a rollback state is a failure here; the reason is Docker's own.
 */
export const waitUpdated = async (
  io: Pick<PlanIo, "service" | "sleep">,
  serviceId: string,
  since: string,
  opts: Pick<PlanOptions, "timeoutMs" | "intervalMs">,
): Promise<string | null> => {
  const rounds = Math.max(1, Math.ceil(opts.timeoutMs / opts.intervalMs));
  let last = "the update did not start";
  // Docker words the cause while it rolls back ("update rolled back due to failure of task …") and
  // then overwrites it with "rollback completed": keep the first explanation seen.
  let cause = "";
  for (let i = 0; i < rounds; i++) {
    const svc = await io.service(serviceId);
    const u = svc?.update;
    if (u && u.state !== null && u.startedAt !== since) {
      if (u.state === "completed") return null;
      if (UPDATE_FAILED.has(u.state)) {
        if (!cause && u.message && u.message !== "rollback completed") cause = u.message;
        // Wait for the engine to finish putting things back, so the plan's own undo does not race it.
        if (
          u.state === "rollback_completed" ||
          u.state === "paused" ||
          u.state === "rollback_paused"
        )
          return cause || u.message || u.state;
      }
      last = u.state;
    }
    await io.sleep(opts.intervalMs);
  }
  return cause || `did not finish in time (${last})`;
};

const desiredCopies = (item: PlanItem): number =>
  item.kind === "create"
    ? item.spec.global
      ? 1
      : (item.spec.replicas ?? 1)
    : item.kind === "scale"
      ? item.to
      : 0;

/** The request that applies an update, and the one that puts it back (environment aside: see `applyPlan`). */
export const updatePatch = (c: UpdateFields): UpdateSwarmService => ({
  ...(c.image ? { image: c.image.to } : {}),
  ...(c.placement ? { placement: c.placement.to } : {}),
  ...(c.networks ? { networks: c.networks } : {}),
  ...(c.ports ? { ports: c.ports.to } : {}),
  ...(c.mounts
    ? { mounts: { add: c.mounts.add, remove: c.mounts.remove.map((m) => m.target) } }
    : {}),
  ...(c.secrets ? { secrets: c.secrets } : {}),
  ...(c.configs ? { configs: c.configs } : {}),
  ...(c.env ? { env: c.env } : {}),
  ...(c.healthcheck ? { healthcheck: c.healthcheck.to } : {}),
  ...(c.resources ? { resources: c.resources.to } : {}),
  ...(c.policy ? { policy: c.policy.to } : {}),
});
export const undoPatch = (c: UpdateFields): UpdateSwarmService => ({
  ...(c.image ? { image: c.image.from } : {}),
  ...(c.placement ? { placement: c.placement.from } : {}),
  ...(c.networks ? { networks: { add: c.networks.remove, remove: c.networks.add } } : {}),
  ...(c.ports ? { ports: c.ports.from } : {}),
  ...(c.mounts
    ? { mounts: { add: c.mounts.remove, remove: c.mounts.add.map((m) => m.target) } }
    : {}),
  ...(c.secrets ? { secrets: { add: c.secrets.remove, remove: c.secrets.add } } : {}),
  ...(c.configs ? { configs: { add: c.configs.remove, remove: c.configs.add } } : {}),
  ...(c.healthcheck ? { healthcheck: c.healthcheck.from } : {}),
  ...(c.resources ? { resources: c.resources.from } : {}),
  ...(c.policy ? { policy: c.policy.from } : {}),
});

/** Everything except the update policy replaces copies, so the plan waits for the rolling update. */
export const rolls = (c: UpdateFields): boolean => Object.keys(c).some((k) => k !== "policy");

/**
 * Applies the plan one change at a time, removals last. When one fails, the ones already done are undone in
 * reverse order (a created service is removed, a scaled or updated one goes back to what it was), so the cluster
 * is left as it was. Nothing is removed that this plan did not create; a removal cannot be undone, which is why it
 * comes after everything that can fail for other reasons.
 */
export const applyPlan = async (
  items: PlanItem[],
  io: PlanIo,
  opts: PlanOptions,
): Promise<PlanResult> => {
  const ordered = [
    ...items.filter((i) => i.kind !== "remove"),
    ...items.filter((i) => i.kind === "remove"),
  ];
  const done: PlanItem[] = [];
  const createdIds = new Map<PlanItem, string>();
  // The engine keeps only the spec before the last update, so an environment change can be undone by the
  // engine's own rollback only when it is the one update this plan makes to that service.
  const touches = new Map<string, number>();
  for (const i of items)
    if (i.kind !== "create" && i.kind !== "remove") {
      const id = itemServiceId(i);
      if (id) touches.set(id, (touches.get(id) ?? 0) + 1);
    }
  const undo = async (
    list: PlanItem[],
    failing?: PlanItem,
  ): Promise<Pick<PlanResult, "rolledBack" | "rollbackErrors">> => {
    const rolledBack: PlanItem[] = [];
    const rollbackErrors: PlanResult["rollbackErrors"] = [];
    for (const item of [...list].reverse()) {
      try {
        if (item.kind === "create") {
          const id = createdIds.get(item);
          if (id) await io.remove(id);
        } else if (item.kind === "scale") {
          await io.update(item.serviceId, { replicas: item.from });
        } else if (item.kind === "update") {
          if (item.changes.env && item !== failing) {
            if (touches.get(item.serviceId) === 1) {
              // Restores every field of that update, the environment included.
              await io.rollback(item.serviceId);
              rolledBack.push(item);
              continue;
            }
            await io.update(item.serviceId, undoPatch(item.changes));
            throw new Error("environment values cannot be restored automatically");
          }
          await io.update(item.serviceId, undoPatch(item.changes));
        } else if (item.kind === "bind") {
          const id = createdIds.get(item);
          if (id) await io.unbind(id);
        } else if (item.kind === "unbind") {
          // Put the binding back: the consumer gets the same variables again.
          await io.bind({
            consumer: item.consumer.name,
            provider: item.provider,
            name: item.name,
            style: item.style,
          });
        }
        rolledBack.push(item);
      } catch (e) {
        rollbackErrors.push({ item, error: message(e) });
      }
    }
    return { rolledBack, rollbackErrors };
  };

  for (const item of ordered) {
    opts.onStep?.(item, "start");
    let error: string | null = null;
    try {
      if (item.kind === "create") {
        createdIds.set(item, await io.create(item.spec));
      } else if (item.kind === "scale") {
        await io.update(item.serviceId, { replicas: item.to });
      } else if (item.kind === "update") {
        const since = (await io.service(item.serviceId))?.update.startedAt ?? "";
        await io.update(item.serviceId, updatePatch(item.changes));
        // A change of policy alone replaces no copy: there is nothing to wait for.
        if (rolls(item.changes)) {
          opts.onStep?.(item, "waiting");
          error = await waitUpdated(io, item.serviceId, since, opts);
        }
      } else if (item.kind === "bind") {
        const since = (await io.service(item.consumer.id))?.update.startedAt ?? "";
        createdIds.set(
          item,
          await io.bind({
            consumer: item.consumer.name,
            provider: item.provider.name,
            name: item.name,
            style: item.style,
          }),
        );
        opts.onStep?.(item, "waiting");
        error = await waitUpdated(io, item.consumer.id, since, opts);
      } else if (item.kind === "unbind") {
        const since = (await io.service(item.consumer.id))?.update.startedAt ?? "";
        await io.unbind(item.bindingId);
        opts.onStep?.(item, "waiting");
        error = await waitUpdated(io, item.consumer.id, since, opts);
      } else {
        await io.remove(item.serviceId);
      }
      const id =
        item.kind === "create"
          ? createdIds.get(item)
          : item.kind === "scale"
            ? item.serviceId
            : null;
      const wait = item.kind === "scale" && item.to <= item.from ? 0 : desiredCopies(item);
      if (error === null && id && wait > 0) {
        opts.onStep?.(item, "waiting");
        error = await waitConverged(io, id, wait, opts);
      }
    } catch (e) {
      error = message(e);
    }
    if (error !== null) {
      // The failing change is undone too: a created service that never started must not stay behind.
      const undoable = [...done, ...(item.kind === "remove" ? [] : [item])].filter(
        (i) => i.kind !== "remove",
      );
      const { rolledBack, rollbackErrors } = await undo(undoable, item);
      return {
        ok: false,
        done: [],
        failed: { item, error },
        rolledBack,
        rollbackErrors,
        removed: done.filter((i) => i.kind === "remove"),
      };
    }
    done.push(item);
    opts.onStep?.(item, "done");
  }
  return { ok: true, done, rolledBack: [], rollbackErrors: [], removed: [] };
};

const placementFlags = (name: string, from: SwarmPlacement, to: SwarmPlacement): string[] => {
  const flags: string[] = [];
  const tag = (p: SwarmPlacement): string[] => [
    ...(p.role ? [`node.role==${p.role}`] : []),
    ...(p.nodeId ? [`node.id==${p.nodeId}`] : []),
  ];
  for (const c of tag(from)) flags.push(`--constraint-rm '${c}'`);
  for (const c of tag(to)) flags.push(`--constraint-add '${c}'`);
  if (to.maxPerNode !== from.maxPerNode)
    flags.push(`--replicas-max-per-node ${to.maxPerNode ?? 0}`);
  return flags.length > 0 ? [`docker service update ${flags.join(" ")} ${name}`] : [];
};

/** The docker command(s) a change stands for, shown before applying. */
export const planCommands = (item: PlanItem): string[] => {
  if (item.kind === "scale") return [`docker service scale ${item.name}=${item.to}`];
  if (item.kind === "remove") return [`docker service rm ${item.name}`];
  if (item.kind === "bind")
    return [
      `docker service update ${[
        ...(item.joins ? [`--network-add ${item.network}`] : []),
        ...item.variables.map((v) => `--env-add ${v}=…`),
      ].join(" ")} ${item.consumer.name}`,
    ];
  if (item.kind === "unbind")
    return [
      `docker service update ${item.variables.map((v) => `--env-rm ${v}`).join(" ")} ${item.consumer.name}`,
    ];
  if (item.kind === "update") {
    const {
      image,
      networks,
      placement,
      ports,
      mounts,
      secrets,
      configs,
      env,
      healthcheck,
      resources,
      policy,
    } = item.changes;
    const flags = (parts: string[]): string[] =>
      parts.length > 0 ? [`docker service update ${parts.join(" ")} ${item.name}`] : [];
    return [
      ...(image ? [`docker service update --image ${image.to} ${item.name}`] : []),
      ...(networks
        ? [
            `docker service update ${[
              ...networks.add.map((n) => `--network-add ${n}`),
              ...networks.remove.map((n) => `--network-rm ${n}`),
            ].join(" ")} ${item.name}`,
          ]
        : []),
      ...(placement ? placementFlags(item.name, placement.from, placement.to) : []),
      ...flags(
        ports
          ? [
              ...ports.from.map((p) => `--publish-rm ${p.published ?? p.target}`),
              ...ports.to.map(
                (p) =>
                  `--publish-add ${p.published ?? p.target}:${p.target}${p.protocol === "udp" ? "/udp" : ""}`,
              ),
            ]
          : [],
      ),
      ...flags([
        ...(mounts?.remove.map((m) => `--mount-rm ${m.target}`) ?? []),
        ...(mounts?.add.map(
          (m) => `--mount-add type=volume,source=${m.source},target=${m.target}`,
        ) ?? []),
        ...(secrets?.remove.map((n) => `--secret-rm ${n}`) ?? []),
        ...(secrets?.add.map((n) => `--secret-add ${n}`) ?? []),
        ...(configs?.remove.map((n) => `--config-rm ${n}`) ?? []),
        ...(configs?.add.map((n) => `--config-add ${n}`) ?? []),
        ...(env?.unset.map((k) => `--env-rm ${k}`) ?? []),
        ...Object.keys(env?.set ?? {}).map((k) => `--env-add ${k}=…`),
      ]),
      ...flags(
        healthcheck
          ? healthcheck.to
            ? [
                `--health-cmd '${healthcheck.to.command}'`,
                `--health-interval ${healthcheck.to.intervalSeconds}s`,
                `--health-retries ${healthcheck.to.retries}`,
              ]
            : ["--no-healthcheck"]
          : [],
      ),
      ...flags(
        resources
          ? [
              ...(resources.to.cpuLimit ? [`--limit-cpu ${resources.to.cpuLimit}`] : []),
              ...(resources.to.memoryLimitMb
                ? [`--limit-memory ${resources.to.memoryLimitMb}m`]
                : []),
              ...(resources.to.cpuReserve ? [`--reserve-cpu ${resources.to.cpuReserve}`] : []),
              ...(resources.to.memoryReserveMb
                ? [`--reserve-memory ${resources.to.memoryReserveMb}m`]
                : []),
            ]
          : [],
      ),
      ...flags(
        policy
          ? [
              `--update-order ${policy.to.order}`,
              `--update-failure-action ${policy.to.failureAction}`,
              `--update-parallelism ${policy.to.parallelism}`,
              `--update-delay ${policy.to.delaySeconds}s`,
              `--update-monitor ${policy.to.monitorSeconds}s`,
            ]
          : [],
      ),
    ];
  }
  const { spec } = item;
  const parts = ["docker service create", `--name ${spec.name}`];
  parts.push(spec.global ? "--mode global" : `--replicas ${spec.replicas ?? 1}`);
  for (const n of spec.networks ?? []) parts.push(`--network ${n}`);
  for (const m of spec.mounts ?? [])
    parts.push(
      `--mount type=volume,source=${m.source},target=${m.target}${m.readOnly ? ",readonly" : ""}`,
    );
  for (const s of spec.secrets ?? []) parts.push(`--secret ${s}`);
  for (const c of spec.configs ?? []) parts.push(`--config ${c}`);
  if (spec.healthcheck) parts.push(`--health-cmd '${spec.healthcheck.command}'`);
  if (spec.resources?.cpuLimit) parts.push(`--limit-cpu ${spec.resources.cpuLimit}`);
  if (spec.resources?.memoryLimitMb) parts.push(`--limit-memory ${spec.resources.memoryLimitMb}m`);
  if (spec.resources?.cpuReserve) parts.push(`--reserve-cpu ${spec.resources.cpuReserve}`);
  if (spec.resources?.memoryReserveMb)
    parts.push(`--reserve-memory ${spec.resources.memoryReserveMb}m`);
  if (spec.placement?.role) parts.push(`--constraint 'node.role==${spec.placement.role}'`);
  if (spec.placement?.nodeId) parts.push(`--constraint 'node.id==${spec.placement.nodeId}'`);
  if (spec.placement?.maxPerNode)
    parts.push(`--replicas-max-per-node ${spec.placement.maxPerNode}`);
  for (const p of spec.ports ?? [])
    parts.push(
      `--publish ${p.published ?? p.target}:${p.target}${p.protocol === "udp" ? "/udp" : ""}`,
    );
  for (const k of Object.keys(spec.env ?? {})) parts.push(`--env ${k}=…`);
  parts.push(spec.image);
  return [parts.join(" ")];
};

/** The names of the services that exist after the plan (created ones), so a second change cannot reuse a name. */
export const plannedNames = (items: PlanItem[]): string[] =>
  items.flatMap((i) => (i.kind === "create" ? [i.spec.name] : []));

/** What is already in the plan about one existing service. */
const updateOf = (plan: PlanItem[], serviceId: string): PlannedUpdate | undefined =>
  plan.find((p): p is PlannedUpdate => p.kind === "update" && p.serviceId === serviceId);

const isEmpty = (c: UpdateFields): boolean => Object.keys(c).length === 0;

/** Changes the update item of a service (creating it, or dropping it once nothing is left to change). */
export const upsertUpdate = (
  plan: PlanItem[],
  svc: { id: string; name: string },
  change: (c: UpdateFields) => UpdateFields,
): PlanItem[] => {
  const current = updateOf(plan, svc.id);
  const next = change(current?.changes ?? {});
  const rest = plan.filter((p) => p !== current);
  return isEmpty(next)
    ? rest
    : [...rest, { kind: "update", serviceId: svc.id, name: svc.name, changes: next }];
};

const samePlacement = (a: SwarmPlacement, b: SwarmPlacement): boolean =>
  a.role === b.role && a.nodeId === b.nodeId && a.maxPerNode === b.maxPerNode;

export const planImage =
  (current: string, to: string) =>
  (c: UpdateFields): UpdateFields => {
    const { image: _drop, ...rest } = c;
    return to === current || to === "" ? rest : { ...rest, image: { from: current, to } };
  };

export const planPlacement =
  (current: SwarmPlacement, to: SwarmPlacement) =>
  (c: UpdateFields): UpdateFields => {
    const { placement: _drop, ...rest } = c;
    return samePlacement(current, to) ? rest : { ...rest, placement: { from: current, to } };
  };

/** Moves a service from one overlay to another (either may be none): leaves `from`, joins `to`. */
export const planMove =
  (from: string | null, to: string | null) =>
  (c: UpdateFields): UpdateFields => {
    if (from === to) return c;
    const net = c.networks ?? { add: [], remove: [] };
    let add = net.add;
    let remove = net.remove;
    if (from) {
      if (add.includes(from)) add = add.filter((n) => n !== from);
      else remove = [...remove, from];
    }
    if (to) {
      if (remove.includes(to)) remove = remove.filter((n) => n !== to);
      else add = [...add, to];
    }
    const { networks: _drop, ...rest } = c;
    return add.length === 0 && remove.length === 0 ? rest : { ...rest, networks: { add, remove } };
  };

/** The overlays a service will be on once the plan is applied. */
export const effectiveNetworks = (
  current: string[],
  plan: PlanItem[],
  serviceId: string,
): string[] => {
  const n = updateOf(plan, serviceId)?.changes.networks;
  return n ? [...current.filter((x) => !n.remove.includes(x)), ...n.add] : current;
};

/** The service's replica count after the plan (a scale item replaces the one before it). */
export const planScale = (
  plan: PlanItem[],
  svc: { id: string; name: string; desired: number },
  to: number,
): PlanItem[] => {
  const rest = plan.filter((p) => !(p.kind === "scale" && p.serviceId === svc.id));
  return to === svc.desired
    ? rest
    : [...rest, { kind: "scale", serviceId: svc.id, name: svc.name, from: svc.desired, to }];
};

/** Removing a service replaces any other change planned for it. */
export const planRemove = (plan: PlanItem[], svc: { id: string; name: string }): PlanItem[] => [
  ...plan.filter((p) => itemServiceId(p) !== svc.id),
  { kind: "remove", serviceId: svc.id, name: svc.name },
];

const sameJson = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const without = <T extends object>(c: T, key: keyof T): T => {
  const { [key]: _drop, ...rest } = c;
  return rest as T;
};

const diffNames = (current: string[], wanted: string[]): { add: string[]; remove: string[] } => ({
  add: wanted.filter((n) => !current.includes(n)),
  remove: current.filter((n) => !wanted.includes(n)),
});

export const planPorts =
  (current: SwarmPort[], to: SwarmPort[]) =>
  (c: UpdateFields): UpdateFields =>
    sameJson(current, to) ? without(c, "ports") : { ...c, ports: { from: current, to } };

/** `wanted` is the full list of mounts the service should have. */
export const planMounts =
  (current: SwarmMount[], wanted: SwarmMount[]) =>
  (c: UpdateFields): UpdateFields => {
    const same = (a: SwarmMount, b: SwarmMount) => sameJson(a, b);
    const add = wanted.filter((w) => !current.some((m) => same(m, w)));
    const remove = current.filter((m) => !wanted.some((w) => same(m, w)));
    return add.length === 0 && remove.length === 0
      ? without(c, "mounts")
      : { ...c, mounts: { add, remove } };
  };

export const planSecrets =
  (current: string[], wanted: string[]) =>
  (c: UpdateFields): UpdateFields => {
    const d = diffNames(current, wanted);
    return d.add.length === 0 && d.remove.length === 0
      ? without(c, "secrets")
      : { ...c, secrets: d };
  };

export const planConfigs =
  (current: string[], wanted: string[]) =>
  (c: UpdateFields): UpdateFields => {
    const d = diffNames(current, wanted);
    return d.add.length === 0 && d.remove.length === 0
      ? without(c, "configs")
      : { ...c, configs: d };
  };

/** Adds a variable to set; setting it again replaces the value, and it cancels a pending removal. */
export const planEnvSet =
  (key: string, value: string) =>
  (c: UpdateFields): UpdateFields => ({
    ...c,
    env: {
      set: { ...(c.env?.set ?? {}), [key]: value },
      unset: (c.env?.unset ?? []).filter((k) => k !== key),
    },
  });

/** Removes a variable (or cancels one that was about to be set). */
export const planEnvUnset =
  (key: string) =>
  (c: UpdateFields): UpdateFields => {
    const { [key]: _gone, ...set } = c.env?.set ?? {};
    const unset = [...(c.env?.unset ?? []).filter((k) => k !== key), key];
    return { ...c, env: { set, unset } };
  };

/** Takes a pending environment change back out of the plan (by name). */
export const planEnvForget =
  (key: string) =>
  (c: UpdateFields): UpdateFields => {
    if (!c.env) return c;
    const { [key]: _gone, ...set } = c.env.set;
    const unset = c.env.unset.filter((k) => k !== key);
    return Object.keys(set).length === 0 && unset.length === 0
      ? without(c, "env")
      : { ...c, env: { set, unset } };
  };

export const planHealthcheck =
  (current: SwarmHealthcheck | null, to: SwarmHealthcheck | null) =>
  (c: UpdateFields): UpdateFields =>
    sameJson(current, to)
      ? without(c, "healthcheck")
      : { ...c, healthcheck: { from: current, to } };

export const planResources =
  (current: SwarmResources, to: SwarmResources) =>
  (c: UpdateFields): UpdateFields =>
    sameJson(current, to) ? without(c, "resources") : { ...c, resources: { from: current, to } };

export const planPolicy =
  (current: Required<SwarmUpdatePolicy>, to: Required<SwarmUpdatePolicy>) =>
  (c: UpdateFields): UpdateFields =>
    sameJson(current, to) ? without(c, "policy") : { ...c, policy: { from: current, to } };
