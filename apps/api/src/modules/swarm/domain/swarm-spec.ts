import type {
  ClusterTask,
  CreateSwarmService,
  SwarmNode,
  SwarmService,
  SwarmTask,
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
      ContainerSpec: { Image: string; Env?: string[]; Command?: string[]; Args?: string[] };
      Networks?: { Target: string }[];
    };
    Mode?: { Replicated?: { Replicas?: number }; Global?: object };
    EndpointSpec?: { Ports?: RawPort[] };
  };
  Endpoint?: { Ports?: RawPort[]; VirtualIPs?: { NetworkID: string }[] };
  ServiceStatus?: { RunningTasks: number; DesiredTasks: number };
}

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

export const toServiceSpec = (r: CreateSwarmService): RawService["Spec"] => ({
  Name: r.name,
  Labels: { "nautix.managed": "true" },
  TaskTemplate: {
    ContainerSpec: {
      Image: r.image,
      ...(Object.keys(r.env).length
        ? { Env: Object.entries(r.env).map(([k, v]) => `${k}=${v}`) }
        : {}),
      ...(r.command?.length ? { Args: r.command } : {}),
    },
    ...(r.networks.length ? { Networks: r.networks.map((Target) => ({ Target })) } : {}),
  },
  Mode: r.global ? { Global: {} } : { Replicated: { Replicas: r.replicas } },
  EndpointSpec: {
    Ports: r.ports.map((p) => ({
      Protocol: p.protocol,
      TargetPort: p.target,
      ...(p.published ? { PublishedPort: p.published } : {}),
      PublishMode: "ingress",
    })),
  },
});

/** Applies an update to the current spec, leaving everything else (networks, secrets, …) intact. */
export const patchServiceSpec = (
  spec: RawService["Spec"],
  patch: UpdateSwarmService,
): RawService["Spec"] => ({
  ...spec,
  TaskTemplate: {
    ...spec.TaskTemplate,
    ContainerSpec: {
      ...spec.TaskTemplate.ContainerSpec,
      ...(patch.image ? { Image: patch.image } : {}),
    },
  },
  ...(patch.replicas !== undefined && spec.Mode?.Replicated
    ? { Mode: { Replicated: { Replicas: patch.replicas } } }
    : {}),
});

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
