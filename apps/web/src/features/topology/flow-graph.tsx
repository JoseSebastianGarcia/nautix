import type { Container } from "@nautix/contracts";
import type { Edge } from "@xyflow/react";
import { NODE_H, NODE_W, type Topology } from "./layout.js";
import { type ContainerFlowNode, ContainerNode, type ZoneFlowNode, ZoneNode } from "./nodes.js";

export const nodeTypes = { container: ContainerNode, zone: ZoneNode };

export type FlowNode = ContainerFlowNode | ZoneFlowNode;

export const toNodes = (
  topology: Topology,
  containers: Container[],
  draggableZones: boolean,
): FlowNode[] => {
  const byId = new Map(containers.map((c) => [c.id, c]));
  const zones: ZoneFlowNode[] = topology.zones.map((z) => ({
    id: `z:${z.id}`,
    type: "zone",
    position: { x: z.x, y: z.y },
    data: { network: z.network, count: z.containerIds.length, w: z.w, h: z.h },
    draggable: draggableZones,
    zIndex: -1,
    width: z.w,
    height: z.h,
  }));
  const nodes: ContainerFlowNode[] = topology.placements.flatMap((p) => {
    const container = byId.get(p.containerId);
    const zone = topology.zones.find((z) => z.id === p.zoneId);
    return container && zone
      ? [
          {
            id: `c:${p.containerId}`,
            type: "container" as const,
            // Children are positioned relative to their box, so dragging a box moves them with it.
            parentId: `z:${p.zoneId}`,
            position: { x: p.x - zone.x, y: p.y - zone.y },
            data: { container },
            zIndex: 1,
            width: NODE_W,
            height: NODE_H,
          },
        ]
      : [];
  });
  return [...zones, ...nodes];
};

export const toEdges = (topology: Topology): Edge[] =>
  topology.links.map((l) => ({
    id: `l:${l.containerId}:${l.zoneId}`,
    source: `c:${l.containerId}`,
    target: `z:${l.zoneId}`,
    animated: true,
    style: { strokeDasharray: "6 4", stroke: "var(--nx-accent)" },
  }));
