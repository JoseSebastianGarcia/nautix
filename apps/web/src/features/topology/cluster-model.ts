import type {
  ClusterTask,
  Network,
  SwarmCluster,
  SwarmNode,
  SwarmService,
} from "@nautix/contracts";

export type Health = "ok" | "degraded" | "down";
export type PlacementState = "ok" | "pending" | "bad";

/** One copy of a service as it should be drawn: where it runs and whether it is well. */
export interface Placement {
  task: ClusterTask;
  node: SwarmNode | null;
  state: PlacementState;
}

export interface ClusterService {
  service: SwarmService;
  placements: Placement[];
  health: Health;
  /** Copies that should exist but have no task yet (the cluster is looking for a place for them). */
  missing: number;
  /** Names of the overlay networks it is on. */
  networks: string[];
}

export interface ClusterZone {
  network: Network;
  services: ClusterService[];
}

export interface ServerColumn {
  node: SwarmNode;
  placements: (Placement & { service: ClusterService })[];
}

export interface ClusterModel {
  zones: ClusterZone[];
  /** Services that are on no overlay network (ingress only, or none). */
  loose: ClusterService[];
  servers: ServerColumn[];
  services: ClusterService[];
}

const PENDING = new Set([
  "new",
  "pending",
  "assigned",
  "accepted",
  "ready",
  "preparing",
  "starting",
]);

/** Swarm keeps the history of every task; the current ones are those the cluster still wants running. */
const isCurrent = (t: ClusterTask): boolean => t.desiredState === "running";

export const placementState = (t: ClusterTask): PlacementState =>
  t.state === "running" ? "ok" : PENDING.has(t.state) ? "pending" : "bad";

const healthOf = (running: number, desired: number): Health =>
  desired > 0 && running >= desired ? "ok" : running === 0 ? "down" : "degraded";

/** Networks are matched by id or by name: a service spec can carry either. */
const onNetwork = (service: SwarmService, network: Network): boolean =>
  service.networks.includes(network.id) || service.networks.includes(network.name);

export const buildCluster = (cluster: SwarmCluster, networks: Network[]): ClusterModel => {
  const nodeById = new Map(cluster.nodes.map((n) => [n.id, n]));
  const overlays = networks.filter((n) => n.driver === "overlay" && !n.system);

  const services: ClusterService[] = cluster.services.map((service) => {
    const placements = cluster.tasks
      .filter((t) => t.serviceId === service.id && isCurrent(t))
      .sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0))
      .map((task) => ({
        task,
        node: nodeById.get(task.nodeId) ?? null,
        state: placementState(task),
      }));
    const running = placements.filter((p) => p.state === "ok").length;
    return {
      service,
      placements,
      health: healthOf(running, service.desired),
      missing: Math.max(0, service.desired - placements.length),
      networks: overlays.filter((n) => onNetwork(service, n)).map((n) => n.name),
    };
  });

  const zones = overlays
    .map((network) => ({
      network,
      services: services.filter((s) => onNetwork(s.service, network)),
    }))
    .filter((z) => z.services.length > 0)
    .sort((a, b) => a.network.name.localeCompare(b.network.name));

  const loose = services.filter((s) => s.networks.length === 0);

  const servers = [...cluster.nodes]
    .sort(
      (a, b) =>
        Number(b.role === "manager") - Number(a.role === "manager") ||
        a.hostname.localeCompare(b.hostname),
    )
    .map((node) => ({
      node,
      placements: services
        .flatMap((service) =>
          service.placements
            .filter((p) => p.task.nodeId === node.id)
            .map((p) => ({ ...p, service })),
        )
        .sort((a, b) => a.service.service.name.localeCompare(b.service.service.name)),
    }));

  return { zones, loose, servers, services };
};

/** Same network, same colour, in every view. */
const TINTS = ["var(--nx-accent)", "var(--nx-cyan)", "var(--nx-amber)", "var(--nx-ok)"];
export const networkTint = (name: string): string => {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return TINTS[hash % TINTS.length] ?? "var(--nx-accent)";
};
