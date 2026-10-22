import type { Network, SwarmCluster } from "@nautix/contracts";
import { buildCluster } from "../topology/cluster-model.js";

export interface LeaveImpact {
  /** Overlay networks with services: they have no cluster left once this node leaves. */
  zones: string[];
  services: string[];
  /** This node is the only manager: leaving dissolves the cluster. */
  lastManager: boolean;
  /** Only a manager can list what is running; for a worker the lists are unknown. */
  known: boolean;
}

/** What leaving the swarm takes with it, from what the manager says is running. */
export const leaveImpact = (cluster: SwarmCluster, networks: Network[]): LeaveImpact => {
  const { status } = cluster;
  const known = status.isManager && !status.locked;
  if (!known) return { zones: [], services: [], lastManager: false, known: false };
  const model = buildCluster(cluster, networks);
  return {
    zones: model.zones.map((z) => z.network.name),
    services: cluster.services.map((s) => s.name).sort(),
    lastManager: status.managers <= 1,
    known: true,
  };
};
