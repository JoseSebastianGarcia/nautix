import type { SwarmNode, SwarmPlacement } from "@nautix/contracts";

export interface Schedule {
  /** One entry per copy that found a node, in slot order. */
  nodeIds: string[];
  /** Copies that found none, and why. */
  unplaced: number;
  reason: string;
}

/**
 * How Swarm places copies, as far as Nautix models it: only nodes that are ready and active, narrowed by the
 * role and node constraints, spread one at a time over the least loaded node, never beyond `maxPerNode`.
 * A global service puts one copy on every eligible node. Used by the demo engine.
 */
export const scheduleTasks = (
  nodes: SwarmNode[],
  placement: SwarmPlacement,
  mode: "replicated" | "global",
  desired: number,
): Schedule => {
  const eligible = nodes.filter(
    (n) =>
      n.state === "ready" &&
      n.availability === "active" &&
      (!placement.role || n.role === placement.role) &&
      (!placement.nodeId || n.id === placement.nodeId),
  );
  if (mode === "global") return { nodeIds: eligible.map((n) => n.id), unplaced: 0, reason: "" };
  const load = new Map(eligible.map((n) => [n.id, 0]));
  const cap = placement.maxPerNode ?? Number.POSITIVE_INFINITY;
  const nodeIds: string[] = [];
  for (let i = 0; i < desired; i++) {
    const next = [...load.entries()]
      .filter(([, count]) => count < cap)
      .sort((a, b) => a[1] - b[1])[0];
    if (!next) break;
    load.set(next[0], next[1] + 1);
    nodeIds.push(next[0]);
  }
  const unplaced = desired - nodeIds.length;
  const reason =
    unplaced === 0
      ? ""
      : eligible.length === 0
        ? "no suitable node (scheduling constraints not satisfied on any node)"
        : `no suitable node (max replicas per node limit exceeded on ${eligible.length} node(s))`;
  return { nodeIds, unplaced, reason };
};
