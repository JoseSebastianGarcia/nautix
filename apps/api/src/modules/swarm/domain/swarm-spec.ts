import type {
  ClusterTask,
  CreateSwarmService,
  SwarmHealthcheck,
  SwarmMount,
  SwarmNode,
  SwarmPlacement,
  SwarmResources,
  SwarmService,
  SwarmTask,
  SwarmUpdatePolicy,
  SwarmUpdateState,
  UpdateSwarmService,
} from "@nautix/contracts";

/** Raw shapes of the engine's swarm API (only the fields Nautix reads). */
export interface RawService {
  ID: string;
  Version?: { Index: number };
  UpdatedAt?: string;
  Spec: {
    Name: string;
    Labels?: Record<string, string>;
    TaskTemplate: {
      ContainerSpec: {
        Image: string;
        Env?: string[];
        Command?: string[];
        Args?: string[];
        Mounts?: RawMount[];
        Secrets?: RawSecretRef[];
        Configs?: RawConfigRef[];
        Healthcheck?: RawHealthcheck;
      };
      Resources?: RawResources;
      Networks?: { Target: string }[];
      Placement?: RawPlacement;
    };
    UpdateConfig?: RawUpdateConfig;
    RollbackConfig?: RawUpdateConfig;
    Mode?: { Replicated?: { Replicas?: number }; Global?: object };
    EndpointSpec?: { Ports?: RawPort[] };
  };
  Endpoint?: { Ports?: RawPort[]; VirtualIPs?: { NetworkID: string }[] };
  ServiceStatus?: { RunningTasks: number; DesiredTasks: number };
  UpdateStatus?: { State?: string; Message?: string; StartedAt?: string };
}

export interface RawMount {
  Type?: string;
  Source?: string;
  Target?: string;
  ReadOnly?: boolean;
}

export interface RawSecretRef {
  SecretID: string;
  SecretName: string;
  File?: { Name: string; UID: string; GID: string; Mode: number };
}

export interface RawConfigRef {
  ConfigID: string;
  ConfigName: string;
  File?: { Name: string; UID: string; GID: string; Mode: number };
}

export interface RawHealthcheck {
  Test?: string[];
  /** Nanoseconds. */
  Interval?: number;
  Timeout?: number;
  StartPeriod?: number;
  Retries?: number;
}

export interface RawResources {
  Limits?: { NanoCPUs?: number; MemoryBytes?: number };
  Reservations?: { NanoCPUs?: number; MemoryBytes?: number };
}

export interface RawPlacement {
  Constraints?: string[];
  MaxReplicas?: number;
}

export interface RawUpdateConfig {
  Parallelism?: number;
  /** Nanoseconds. */
  Delay?: number;
  FailureAction?: string;
  /** Nanoseconds. */
  Monitor?: number;
  Order?: string;
}

const NS = 1_000_000_000;

export interface RawPort {
  Protocol?: string;
  TargetPort: number;
  PublishedPort?: number;
  PublishMode?: string;
}

export interface RawNode {
  ID: string;
  Version?: { Index: number };
  Spec: { Role?: string; Availability?: string; Labels?: Record<string, string> };
  Description?: { Hostname?: string; Engine?: { EngineVersion?: string } };
  Status?: { State?: string; Addr?: string };
  ManagerStatus?: { Leader?: boolean; Addr?: string };
}

export interface RawTask {
  ID: string;
  ServiceID?: string;
  NodeID?: string;
  Slot?: number;
  DesiredState: string;
  UpdatedAt?: string;
  Status?: { State?: string; Err?: string };
  Spec?: { ContainerSpec?: { Image?: string } };
}

const STACK_LABEL = "com.docker.stack.namespace";

/** `nginx:1.27@sha256:…` → `nginx:1.27`. */
export const plainImage = (image: string): string => image.split("@")[0] ?? image;

/** Constraints Nautix manages; any other constraint a service already has is left alone. */
const MANAGED = /^node\.(role|id)\s*==/;

export const toPlacement = (p: SwarmPlacement, keep: string[] = []): RawPlacement => ({
  Constraints: [
    ...keep.filter((c) => !MANAGED.test(c)),
    ...(p.role ? [`node.role==${p.role}`] : []),
    ...(p.nodeId ? [`node.id==${p.nodeId}`] : []),
  ],
  ...(p.maxPerNode ? { MaxReplicas: p.maxPerNode } : {}),
});

export const fromPlacement = (raw: RawPlacement | undefined): SwarmPlacement => {
  const out: SwarmPlacement = {};
  for (const c of raw?.Constraints ?? []) {
    const m = /^node\.(role|id)\s*==\s*(.+)$/.exec(c);
    if (m?.[1] === "role" && (m[2] === "manager" || m[2] === "worker")) out.role = m[2];
    if (m?.[1] === "id" && m[2]) out.nodeId = m[2];
  }
  if (raw?.MaxReplicas) out.maxPerNode = raw.MaxReplicas;
  return out;
};

/** Two copies cannot overlap when they share a node-local volume or a per-node limit: stop the old one first. */
export const defaultOrder = (
  hasVolumes: boolean,
  placement: SwarmPlacement,
): "start-first" | "stop-first" =>
  hasVolumes || placement.maxPerNode ? "stop-first" : "start-first";

export const toUpdateConfig = (
  p: SwarmUpdatePolicy,
  order: "start-first" | "stop-first",
): RawUpdateConfig => ({
  Parallelism: p.parallelism,
  Delay: p.delaySeconds * NS,
  FailureAction: p.failureAction,
  Monitor: p.monitorSeconds * NS,
  Order: p.order ?? order,
});

/** A failed update is undone by Docker itself; undoing the undo (a failed rollback) just pauses. */
const ROLLBACK_CONFIG: RawUpdateConfig = {
  Parallelism: 1,
  FailureAction: "pause",
  Monitor: 5 * NS,
  Order: "stop-first",
};

export const toMounts = (mounts: SwarmMount[]): RawMount[] =>
  mounts.map((m) => ({
    Type: "volume",
    Source: m.source,
    Target: m.target,
    ReadOnly: m.readOnly,
  }));

export const toSecretRefs = (names: string[], idByName: Record<string, string>): RawSecretRef[] =>
  names.map((name) => ({
    SecretID: idByName[name] ?? "",
    SecretName: name,
    File: { Name: name, UID: "0", GID: "0", Mode: 0o444 },
  }));

export const toConfigRefs = (names: string[], idByName: Record<string, string>): RawConfigRef[] =>
  names.map((name) => ({
    ConfigID: idByName[name] ?? "",
    ConfigName: name,
    File: { Name: `/${name}`, UID: "0", GID: "0", Mode: 0o444 },
  }));

const MB = 1024 * 1024;

export const toHealthcheck = (h: SwarmHealthcheck): RawHealthcheck => ({
  Test: ["CMD-SHELL", h.command],
  Interval: h.intervalSeconds * NS,
  Timeout: h.timeoutSeconds * NS,
  StartPeriod: h.startPeriodSeconds * NS,
  Retries: h.retries,
});

export const fromHealthcheck = (raw: RawHealthcheck | undefined): SwarmHealthcheck | null => {
  const test = raw?.Test ?? [];
  if (test.length === 0 || test[0] === "NONE") return null;
  return {
    command: test[0] === "CMD-SHELL" ? (test[1] ?? "") : test.slice(1).join(" "),
    intervalSeconds: Math.round((raw?.Interval ?? 30 * NS) / NS),
    timeoutSeconds: Math.round((raw?.Timeout ?? 30 * NS) / NS),
    retries: raw?.Retries ?? 3,
    startPeriodSeconds: Math.round((raw?.StartPeriod ?? 0) / NS),
  };
};

export const toResources = (r: SwarmResources): RawResources => ({
  ...(r.cpuLimit || r.memoryLimitMb
    ? {
        Limits: {
          ...(r.cpuLimit ? { NanoCPUs: Math.round(r.cpuLimit * NS) } : {}),
          ...(r.memoryLimitMb ? { MemoryBytes: r.memoryLimitMb * MB } : {}),
        },
      }
    : {}),
  ...(r.cpuReserve || r.memoryReserveMb
    ? {
        Reservations: {
          ...(r.cpuReserve ? { NanoCPUs: Math.round(r.cpuReserve * NS) } : {}),
          ...(r.memoryReserveMb ? { MemoryBytes: r.memoryReserveMb * MB } : {}),
        },
      }
    : {}),
});

export const fromResources = (raw: RawResources | undefined): SwarmResources => ({
  ...(raw?.Limits?.NanoCPUs ? { cpuLimit: raw.Limits.NanoCPUs / NS } : {}),
  ...(raw?.Limits?.MemoryBytes ? { memoryLimitMb: Math.round(raw.Limits.MemoryBytes / MB) } : {}),
  ...(raw?.Reservations?.NanoCPUs ? { cpuReserve: raw.Reservations.NanoCPUs / NS } : {}),
  ...(raw?.Reservations?.MemoryBytes
    ? { memoryReserveMb: Math.round(raw.Reservations.MemoryBytes / MB) }
    : {}),
});

/** What Docker applies when a service never set an update policy. */
export const fromUpdateConfig = (
  raw: RawUpdateConfig | undefined,
): Required<SwarmUpdatePolicy> => ({
  order: raw?.Order === "start-first" ? "start-first" : "stop-first",
  failureAction: raw?.FailureAction === "rollback" ? "rollback" : "pause",
  parallelism: raw?.Parallelism ?? 1,
  delaySeconds: Math.round((raw?.Delay ?? 0) / NS),
  monitorSeconds: Math.round((raw?.Monitor ?? 5 * NS) / NS),
});

export const toServiceSpec = (
  r: CreateSwarmService,
  secretIds: Record<string, string> = {},
  configIds: Record<string, string> = {},
): RawService["Spec"] => ({
  Name: r.name,
  Labels: { "nautix.managed": "true" },
  TaskTemplate: {
    ContainerSpec: {
      Image: r.image,
      ...(Object.keys(r.env).length
        ? { Env: Object.entries(r.env).map(([k, v]) => `${k}=${v}`) }
        : {}),
      ...(r.command?.length ? { Args: r.command } : {}),
      ...(r.mounts.length ? { Mounts: toMounts(r.mounts) } : {}),
      ...(r.secrets.length ? { Secrets: toSecretRefs(r.secrets, secretIds) } : {}),
      ...(r.configs.length ? { Configs: toConfigRefs(r.configs, configIds) } : {}),
      ...(r.healthcheck ? { Healthcheck: toHealthcheck(r.healthcheck) } : {}),
    },
    ...(Object.keys(toResources(r.resources)).length > 0
      ? { Resources: toResources(r.resources) }
      : {}),
    ...(r.networks.length ? { Networks: r.networks.map((Target) => ({ Target })) } : {}),
    ...(r.placement.role || r.placement.nodeId || r.placement.maxPerNode
      ? { Placement: toPlacement(r.placement) }
      : {}),
  },
  Mode: r.global ? { Global: {} } : { Replicated: { Replicas: r.replicas } },
  UpdateConfig: toUpdateConfig(r.update, defaultOrder(r.mounts.length > 0, r.placement)),
  RollbackConfig: ROLLBACK_CONFIG,
  EndpointSpec: {
    Ports: r.ports.map((p) => ({
      Protocol: p.protocol,
      TargetPort: p.target,
      ...(p.published ? { PublishedPort: p.published } : {}),
      PublishMode: "ingress",
    })),
  },
});

/**
 * Applies an update to the current spec, leaving everything else (environment, secrets, mounts, other
 * constraints) intact. A service that has no update policy yet gets one, so a bad new image rolls back by
 * itself: stop-first when it has volumes (two copies on one local volume would fight), start-first otherwise.
 */
/** The networks of a spec after joining `add` and leaving `remove`; a name also stands for the id it resolves to. */
export const patchNetworks = (
  current: { Target: string }[] | undefined,
  change: { add: string[]; remove: string[] },
  idByName: Record<string, string> = {},
): { Target: string }[] => {
  const gone = new Set(change.remove.flatMap((n) => [n, idByName[n] ?? n]));
  const kept = (current ?? []).filter((n) => !gone.has(n.Target));
  const have = new Set(kept.flatMap((n) => [n.Target]));
  const added = change.add
    .filter((n) => !have.has(n) && !have.has(idByName[n] ?? n))
    .map((Target) => ({ Target }));
  return [...kept, ...added];
};

/** `KEY=value` lines after unsetting and setting variables; the order of the ones left alone is kept. */
export const patchEnv = (
  current: string[] | undefined,
  change: { set: Record<string, string>; unset: string[] },
): string[] => {
  const keyOf = (line: string): string =>
    line.slice(0, Math.max(0, line.indexOf("=")) || line.length);
  const gone = new Set([...change.unset, ...Object.keys(change.set)]);
  return [
    ...(current ?? []).filter((line) => !gone.has(keyOf(line))),
    ...Object.entries(change.set).map(([k, v]) => `${k}=${v}`),
  ];
};

/** The environment of a spec as a map (used to read a provider's own user and password). */
export const envMap = (spec: RawService["Spec"]): Record<string, string> =>
  Object.fromEntries(
    (spec.TaskTemplate.ContainerSpec.Env ?? []).map((line) => {
      const i = line.indexOf("=");
      return i < 0 ? [line, ""] : [line.slice(0, i), line.slice(i + 1)];
    }),
  );

/** Ids of the secrets and configs a patch adds, by name (the engine looks them up). */
export interface RefIds {
  secrets: Record<string, string>;
  configs: Record<string, string>;
}

/** Everything but the update policy and the replica count changes what a copy is, so copies are replaced. */
export const rollsOutPatch = (patch: UpdateSwarmService): boolean =>
  patch.image !== undefined ||
  patch.networks !== undefined ||
  patch.placement !== undefined ||
  patch.env !== undefined ||
  patch.ports !== undefined ||
  patch.mounts !== undefined ||
  patch.secrets !== undefined ||
  patch.configs !== undefined ||
  patch.healthcheck !== undefined ||
  patch.resources !== undefined;

export const patchServiceSpec = (
  spec: RawService["Spec"],
  patch: UpdateSwarmService,
  networkIds: Record<string, string> = {},
  refIds: RefIds = { secrets: {}, configs: {} },
): RawService["Spec"] => {
  const rollsOut = rollsOutPatch(patch);
  const container = spec.TaskTemplate.ContainerSpec;
  const hasVolumes = (container.Mounts ?? []).length > 0;

  let mounts = container.Mounts;
  if (patch.mounts) {
    const gone = new Set([...patch.mounts.remove, ...patch.mounts.add.map((m) => m.target)]);
    mounts = [
      ...(container.Mounts ?? []).filter((m) => !gone.has(m.Target ?? "")),
      ...toMounts(patch.mounts.add),
    ];
  }
  let secrets = container.Secrets;
  if (patch.secrets) {
    const gone = new Set([...patch.secrets.remove, ...patch.secrets.add]);
    secrets = [
      ...(container.Secrets ?? []).filter((x) => !gone.has(x.SecretName)),
      ...toSecretRefs(patch.secrets.add, refIds.secrets),
    ];
  }
  let configs = container.Configs;
  if (patch.configs) {
    const gone = new Set([...patch.configs.remove, ...patch.configs.add]);
    configs = [
      ...(container.Configs ?? []).filter((x) => !gone.has(x.ConfigName)),
      ...toConfigRefs(patch.configs.add, refIds.configs),
    ];
  }

  // A key left undefined is not sent (JSON drops it): an emptied list or a removed health check disappears.
  const nonEmpty = <T>(list: T[] | undefined): T[] | undefined =>
    list && list.length > 0 ? list : undefined;
  const nextContainer: typeof container = {
    ...container,
    ...(patch.image ? { Image: patch.image } : {}),
    ...(patch.env ? { Env: patchEnv(container.Env, patch.env) } : {}),
    ...(patch.mounts ? { Mounts: nonEmpty(mounts) } : {}),
    ...(patch.secrets ? { Secrets: nonEmpty(secrets) } : {}),
    ...(patch.configs ? { Configs: nonEmpty(configs) } : {}),
    ...(patch.healthcheck !== undefined
      ? { Healthcheck: patch.healthcheck ? toHealthcheck(patch.healthcheck) : undefined }
      : {}),
  };

  const resources = patch.resources ? toResources(patch.resources) : spec.TaskTemplate.Resources;
  const placement = patch.placement
    ? toPlacement(patch.placement, spec.TaskTemplate.Placement?.Constraints)
    : spec.TaskTemplate.Placement;
  const defaults = {
    failureAction: "rollback" as const,
    parallelism: 1,
    delaySeconds: 5,
    monitorSeconds: 10,
  };

  return {
    ...spec,
    TaskTemplate: {
      ...spec.TaskTemplate,
      ContainerSpec: nextContainer,
      ...(patch.networks
        ? { Networks: patchNetworks(spec.TaskTemplate.Networks, patch.networks, networkIds) }
        : {}),
      ...(placement ? { Placement: placement } : {}),
      Resources: resources && Object.keys(resources).length > 0 ? resources : undefined,
    },
    ...(patch.policy
      ? {
          UpdateConfig: toUpdateConfig(
            patch.policy,
            defaultOrder((nextContainer.Mounts ?? []).length > 0, fromPlacement(placement)),
          ),
        }
      : rollsOut && !spec.UpdateConfig
        ? {
            UpdateConfig: toUpdateConfig(
              defaults,
              defaultOrder(hasVolumes, fromPlacement(placement)),
            ),
          }
        : {}),
    ...(rollsOut && !spec.RollbackConfig ? { RollbackConfig: ROLLBACK_CONFIG } : {}),
    ...(patch.replicas !== undefined && spec.Mode?.Replicated
      ? { Mode: { Replicated: { Replicas: patch.replicas } } }
      : {}),
    ...(patch.ports
      ? {
          EndpointSpec: {
            ...spec.EndpointSpec,
            Ports: patch.ports.map((p) => ({
              Protocol: p.protocol,
              TargetPort: p.target,
              ...(p.published ? { PublishedPort: p.published } : {}),
              PublishMode: "ingress",
            })),
          },
        }
      : {}),
  };
};

const UPDATE_STATES = new Set<string>([
  "updating",
  "paused",
  "completed",
  "rollback_started",
  "rollback_paused",
  "rollback_completed",
]);

export const fromService = (s: RawService): SwarmService => {
  const replicated = s.Spec.Mode?.Replicated;
  const ports = s.Endpoint?.Ports ?? s.Spec.EndpointSpec?.Ports ?? [];
  return {
    id: s.ID,
    name: s.Spec.Name,
    image: plainImage(s.Spec.TaskTemplate.ContainerSpec.Image),
    mode: replicated ? "replicated" : "global",
    replicas: replicated ? (replicated.Replicas ?? 1) : null,
    running: s.ServiceStatus?.RunningTasks ?? 0,
    desired: s.ServiceStatus?.DesiredTasks ?? 0,
    ports: ports.map((p) => ({
      target: p.TargetPort,
      ...(p.PublishedPort ? { published: p.PublishedPort } : {}),
      protocol: p.Protocol === "udp" ? ("udp" as const) : ("tcp" as const),
    })),
    stack: s.Spec.Labels?.[STACK_LABEL] ?? null,
    networks: serviceNetworks(s),
    mounts: (s.Spec.TaskTemplate.ContainerSpec.Mounts ?? [])
      .filter((m) => m.Type === "volume" && m.Source && m.Target)
      .map((m) => ({
        source: m.Source ?? "",
        target: m.Target ?? "",
        readOnly: m.ReadOnly === true,
      })),
    placement: fromPlacement(s.Spec.TaskTemplate.Placement),
    secrets: (s.Spec.TaskTemplate.ContainerSpec.Secrets ?? []).map((x) => x.SecretName),
    configs: (s.Spec.TaskTemplate.ContainerSpec.Configs ?? []).map((x) => x.ConfigName),
    healthcheck: fromHealthcheck(s.Spec.TaskTemplate.ContainerSpec.Healthcheck),
    resources: fromResources(s.Spec.TaskTemplate.Resources),
    policy: fromUpdateConfig(s.Spec.UpdateConfig),
    update: {
      state: UPDATE_STATES.has(s.UpdateStatus?.State ?? "")
        ? (s.UpdateStatus?.State as SwarmUpdateState)
        : null,
      message: s.UpdateStatus?.Message ?? "",
      startedAt: s.UpdateStatus?.StartedAt ?? "",
    },
    updatedAt: s.UpdatedAt ?? "",
  };
};

/** The networks a service is on: the ones its spec asks for plus the ones it got a virtual address on (no duplicates). */
export const serviceNetworks = (s: RawService): string[] => [
  ...new Set([
    ...(s.Spec.TaskTemplate.Networks ?? []).map((n) => n.Target),
    ...(s.Endpoint?.VirtualIPs ?? []).map((v) => v.NetworkID),
  ]),
];

export const fromNode = (n: RawNode): SwarmNode => ({
  id: n.ID,
  hostname: n.Description?.Hostname ?? n.ID.slice(0, 12),
  role: n.Spec.Role === "manager" ? "manager" : "worker",
  availability:
    n.Spec.Availability === "drain"
      ? "drain"
      : n.Spec.Availability === "pause"
        ? "pause"
        : "active",
  state: n.Status?.State ?? "unknown",
  address: n.ManagerStatus?.Addr ?? n.Status?.Addr ?? "",
  leader: n.ManagerStatus?.Leader === true,
  engineVersion: n.Description?.Engine?.EngineVersion ?? "",
});

export const fromTask = (t: RawTask): SwarmTask => ({
  id: t.ID,
  slot: t.Slot ?? null,
  nodeId: t.NodeID ?? "",
  state: t.Status?.State ?? "unknown",
  desiredState: t.DesiredState,
  error: t.Status?.Err ?? "",
  image: plainImage(t.Spec?.ContainerSpec?.Image ?? ""),
  updatedAt: t.UpdatedAt ?? "",
});

export const fromClusterTask = (t: RawTask): ClusterTask => ({
  ...fromTask(t),
  serviceId: t.ServiceID ?? "",
});

/** Stacks are the services that share the `com.docker.stack.namespace` label. */
export const stacksOf = (services: SwarmService[]): { name: string; services: number }[] => {
  const counts = new Map<string, number>();
  for (const s of services) if (s.stack) counts.set(s.stack, (counts.get(s.stack) ?? 0) + 1);
  return [...counts.entries()]
    .map(([name, count]) => ({ name, services: count }))
    .sort((a, b) => a.name.localeCompare(b.name));
};
