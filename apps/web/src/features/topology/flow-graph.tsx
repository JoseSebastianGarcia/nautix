import type { Binding, Container, Network, TunnelInfo } from "@nautix/contracts";
import type { Edge } from "@xyflow/react";
import { type Rect, sidesBetween } from "./edge-sides.js";
import { NODE_H, NODE_W, type Topology, type ZoneLayout } from "./layout.js";
import { type ContainerFlowNode, ContainerNode, type ZoneFlowNode, ZoneNode } from "./nodes.js";

export const nodeTypes = { container: ContainerNode, zone: ZoneNode };

export type FlowNode = ContainerFlowNode | ZoneFlowNode;

export const toNodes = (
  topology: Topology,
  containers: Container[],
  draggableZones: boolean,
  canTunnel = false,
  canBind = false,
  drift: Record<string, number> = {},
): FlowNode[] => {
  const byId = new Map(containers.map((c) => [c.id, c]));
  const zones: ZoneFlowNode[] = topology.zones.map((z) => ({
    id: `z:${z.id}`,
    type: "zone",
    position: { x: z.x, y: z.y },
    data: {
      network: z.network,
      count: z.containerIds.length,
      w: z.w,
      h: z.h,
      canTunnel,
      drift: z.network ? (drift[z.network.name] ?? 0) : 0,
    },
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
            data: { container, canBind },
            zIndex: 1,
            width: NODE_W,
            height: NODE_H,
          },
        ]
      : [];
  });
  return [...zones, ...nodes];
};

const nodeRect = (x: number, y: number): Rect => ({ x, y, w: NODE_W, h: NODE_H });
const zoneRect = (z: ZoneLayout): Rect => ({ x: z.x, y: z.y, w: z.w, h: z.h });

/** The dashed lines from a container to the extra networks it is on, leaving and arriving by the sides that face each other. */
export const toEdges = (topology: Topology): Edge[] =>
  topology.links.flatMap((l) => {
    const place = topology.placements.find((p) => p.containerId === l.containerId);
    const zone = topology.zones.find((z) => z.id === l.zoneId);
    const sides =
      place && zone ? sidesBetween(nodeRect(place.x, place.y), zoneRect(zone)) : undefined;
    return [
      {
        id: `l:${l.containerId}:${l.zoneId}`,
        source: `c:${l.containerId}`,
        target: `z:${l.zoneId}`,
        ...(sides
          ? { sourceHandle: `bind-${sides.source}`, targetHandle: `tunnel-${sides.target}` }
          : {}),
        animated: true,
        style: { strokeDasharray: "6 4", stroke: "var(--nx-accent)" },
      },
    ];
  });

/** One edge per tunnel, drawn between the two network boxes it connects. */
export const tunnelEdges = (
  tunnels: TunnelInfo[],
  networks: Network[],
  zones: ZoneLayout[],
  selectedId?: string,
): Edge[] =>
  tunnels.flatMap((t) => {
    const from = networks.find((n) => n.name === t.from);
    const to = networks.find((n) => n.name === t.to);
    if (!from || !to) return [];
    const a = zones.find((z) => z.id === from.id);
    const b = zones.find((z) => z.id === to.id);
    // Leave by the side that looks at the other network and arrive on the one that looks back.
    const sides =
      a && b ? sidesBetween(zoneRect(a), zoneRect(b)) : { source: "right", target: "left" };
    return [
      {
        id: `t:${t.containerId}`,
        source: `z:${from.id}`,
        target: `z:${to.id}`,
        sourceHandle: `tunnel-${sides.source}`,
        targetHandle: `tunnel-${sides.target}`,
        animated: true,
        label: `:${t.listenPort} → ${t.targetName}:${t.targetPort}`,
        labelStyle: { fill: "var(--nx-text)", fontFamily: "var(--font-mono)", fontSize: 11 },
        labelBgStyle: { fill: "var(--nx-bg-1)", stroke: "var(--nx-line)" },
        labelBgPadding: [6, 3] as [number, number],
        labelBgBorderRadius: 6,
        style: {
          stroke: "var(--nx-accent-2)",
          strokeWidth: selectedId === t.containerId ? 4 : 2.5,
        },
        markerEnd: { type: "arrowclosed" as const, color: "var(--nx-accent-2)" },
      },
    ];
  });

/** One line per binding, from the app to the service it uses, labelled with the kind of service. */
export const bindingEdges = (
  bindings: Binding[],
  containers: Container[],
  topology: Topology,
  selectedId?: string,
): Edge[] =>
  bindings.flatMap((b) => {
    const consumer = containers.find((c) => c.name === b.consumer);
    const provider = containers.find((c) => c.name === b.provider);
    if (!consumer || !provider) return [];
    const from = topology.placements.find((p) => p.containerId === consumer.id);
    const to = topology.placements.find((p) => p.containerId === provider.id);
    const sides =
      from && to
        ? sidesBetween(
            nodeRect(from.x, from.y),
            nodeRect(to.x, to.y),
            // Keep the line off the other containers when another pair of sides is clear.
            topology.placements
              .filter((p) => p !== from && p !== to)
              .map((p) => nodeRect(p.x, p.y)),
          )
        : { source: "right", target: "left" };
    return [
      {
        id: `b:${b.id}`,
        source: `c:${consumer.id}`,
        target: `c:${provider.id}`,
        sourceHandle: `bind-${sides.source}`,
        targetHandle: `bind-${sides.target}`,
        label: b.kind,
        labelStyle: { fill: "var(--nx-text)", fontFamily: "var(--font-mono)", fontSize: 11 },
        labelBgStyle: { fill: "var(--nx-bg-1)", stroke: "var(--nx-line)" },
        labelBgPadding: [6, 3] as [number, number],
        labelBgBorderRadius: 6,
        style: {
          stroke: "var(--nx-accent)",
          strokeWidth: selectedId === b.id ? 4 : 2.5,
        },
        markerEnd: { type: "arrowclosed" as const, color: "var(--nx-accent)" },
      },
    ];
  });
