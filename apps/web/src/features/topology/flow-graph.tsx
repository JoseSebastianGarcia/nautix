import type { Binding, Container, Network, TunnelInfo } from "@nautix/contracts";
import type { Edge } from "@xyflow/react";
import { NODE_H, NODE_W, type Topology } from "./layout.js";
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

export const toEdges = (topology: Topology): Edge[] =>
  topology.links.map((l) => ({
    id: `l:${l.containerId}:${l.zoneId}`,
    source: `c:${l.containerId}`,
    target: `z:${l.zoneId}`,
    animated: true,
    style: { strokeDasharray: "6 4", stroke: "var(--nx-accent)" },
  }));

/** One edge per tunnel, drawn between the two network boxes it connects. */
export const tunnelEdges = (
  tunnels: TunnelInfo[],
  networks: Network[],
  selectedId?: string,
): Edge[] =>
  tunnels.flatMap((t) => {
    const from = networks.find((n) => n.name === t.from);
    const to = networks.find((n) => n.name === t.to);
    if (!from || !to) return [];
    return [
      {
        id: `t:${t.containerId}`,
        source: `z:${from.id}`,
        target: `z:${to.id}`,
        sourceHandle: "tunnel",
        targetHandle: "tunnel",
        animated: true,
        label: `:${t.listenPort} → ${t.targetName}:${t.targetPort}`,
        labelStyle: { fill: "var(--nx-text)", fontFamily: "var(--font-mono)", fontSize: 11 },
        labelBgStyle: { fill: "var(--nx-bg-1)", stroke: "var(--nx-line)" },
        labelBgPadding: [6, 3] as [number, number],
        labelBgBorderRadius: 6,
        style: {
          stroke: "var(--nx-cyan)",
          strokeWidth: selectedId === t.containerId ? 4 : 2.5,
        },
        markerEnd: { type: "arrowclosed" as const, color: "var(--nx-cyan)" },
      },
    ];
  });

/** One line per binding, from the app to the service it uses, labelled with the kind of service. */
export const bindingEdges = (
  bindings: Binding[],
  containers: Container[],
  selectedId?: string,
): Edge[] =>
  bindings.flatMap((b) => {
    const consumer = containers.find((c) => c.name === b.consumer);
    const provider = containers.find((c) => c.name === b.provider);
    if (!consumer || !provider) return [];
    return [
      {
        id: `b:${b.id}`,
        source: `c:${consumer.id}`,
        target: `c:${provider.id}`,
        sourceHandle: "bind",
        targetHandle: "bind",
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
