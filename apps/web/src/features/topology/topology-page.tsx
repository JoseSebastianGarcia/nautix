import type { Container, Network, Template } from "@nautix/contracts";
import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  Controls,
  type Edge,
  MiniMap,
  type Node,
  type NodeChange,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { LayoutGrid } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../app/api.js";
import { cli } from "../../app/cli.js";
import { keys, useCatalog, useContainers, useNetworks } from "../../app/queries.js";
import { useApiMutation } from "../../app/use-api-mutation.js";
import { Button, ConfirmDialog } from "../../components/ui.js";
import { DeployDialog, type DeployTarget } from "./deploy-dialog.js";
import { Inspector, type Selection } from "./inspector.js";
import { EXTERNAL_ID, layoutTopology, NODE_H, NODE_W, type Topology, zoneAt } from "./layout.js";
import { type MoveStep, planMove } from "./move-plan.js";
import { NetworkDialog } from "./network-dialog.js";
import { type ContainerFlowNode, ContainerNode, type ZoneFlowNode, ZoneNode } from "./nodes.js";
import { CUSTOM_TEMPLATE_ID, DRAG_TYPE, Palette } from "./palette.js";

const NO_CONTAINERS: Container[] = [];
const NO_NETWORKS: Network[] = [];
const NO_TEMPLATES: Template[] = [];

const nodeTypes = { container: ContainerNode, zone: ZoneNode };

type FlowNode = ContainerFlowNode | ZoneFlowNode;

const toNodes = (topology: Topology, containers: Container[]): FlowNode[] => {
  const byId = new Map(containers.map((c) => [c.id, c]));
  const zones: ZoneFlowNode[] = topology.zones.map((z) => ({
    id: `z:${z.id}`,
    type: "zone",
    position: { x: z.x, y: z.y },
    data: { network: z.network, count: z.containerIds.length, w: z.w, h: z.h },
    draggable: false,
    zIndex: -1,
    width: z.w,
    height: z.h,
  }));
  const nodes: ContainerFlowNode[] = topology.placements.flatMap((p) => {
    const container = byId.get(p.containerId);
    return container
      ? [
          {
            id: `c:${p.containerId}`,
            type: "container" as const,
            position: { x: p.x, y: p.y },
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

const toEdges = (topology: Topology): Edge[] =>
  topology.links.map((l) => ({
    id: `l:${l.containerId}:${l.zoneId}`,
    source: `c:${l.containerId}`,
    target: `z:${l.zoneId}`,
    animated: true,
    style: { strokeDasharray: "6 4", stroke: "var(--nx-accent)" },
  }));

interface PendingMove {
  container: Container;
  from: Network | null;
  to: Network | null;
  steps: MoveStep[];
}

function Canvas() {
  const { t } = useTranslation();
  const { data: containers = NO_CONTAINERS } = useContainers();
  const { data: networks = NO_NETWORKS } = useNetworks();
  const { data: catalog = NO_TEMPLATES } = useCatalog();
  const flow = useReactFlow();

  const topology = useMemo(() => layoutTopology(containers, networks), [containers, networks]);
  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [selection, setSelection] = useState<Selection>(null);
  const [deploy, setDeploy] = useState<DeployTarget | null>(null);
  const [newNetwork, setNewNetwork] = useState(false);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);

  // Re-sync from engine data whenever it changes (drag offsets are intentionally discarded).
  const fitted = useRef(false);
  useEffect(() => {
    setNodes(toNodes(topology, containers));
    if (!fitted.current && containers.length > 0) {
      fitted.current = true;
      requestAnimationFrame(() => void flow.fitView({ padding: 0.1, maxZoom: 1 }));
    }
  }, [topology, containers, flow]);

  const relayout = useCallback(
    () => setNodes(toNodes(topology, containers)),
    [topology, containers],
  );

  const move = useApiMutation(
    async (m: PendingMove) => {
      for (const s of m.steps) {
        if (s.op === "connect") await api.connect(s.networkId, m.container.id);
        else await api.disconnect(s.networkId, m.container.id);
      }
    },
    [keys.containers, keys.networks],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange<FlowNode>[]) => setNodes((current) => applyNodeChanges(changes, current)),
    [],
  );

  const onNodeDragStop = useCallback(
    (_: unknown, node: Node) => {
      if (!node.id.startsWith("c:")) return;
      const id = node.id.slice(2);
      const container = containers.find((c) => c.id === id);
      const current = topology.placements.find((p) => p.containerId === id);
      const target = zoneAt(
        topology.zones,
        node.position.x + NODE_W / 2,
        node.position.y + NODE_H / 2,
      );
      if (!container || !current || !target || target.id === current.zoneId) {
        relayout();
        return;
      }
      const from = topology.zones.find((z) => z.id === current.zoneId)?.network ?? null;
      const to = target.network;
      const steps = planMove(container, networks, from, to);
      if (steps.length === 0) {
        relayout();
        return;
      }
      setPendingMove({ container, from, to, steps });
    },
    [containers, networks, topology, relayout],
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const id = event.dataTransfer.getData(DRAG_TYPE);
      if (!id) return;
      const point = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const zone = zoneAt(topology.zones, point.x, point.y);
      const network = zone?.network ?? null;
      const template: Template | typeof CUSTOM_TEMPLATE_ID | undefined =
        id === CUSTOM_TEMPLATE_ID ? CUSTOM_TEMPLATE_ID : catalog.find((c) => c.id === id);
      if (template) setDeploy({ template, network });
    },
    [flow, topology.zones, catalog],
  );

  const label = (n: Network | null) => n?.name ?? t("topology.external");

  return (
    <div className="flex h-full min-h-0">
      <Palette
        onNewNetwork={() => setNewNetwork(true)}
        onPick={(template) => setDeploy({ template, network: null })}
      />
      {/* biome-ignore lint/a11y/noStaticElementInteractions: HTML5 drop target for palette items */}
      <div
        className="relative min-w-0 flex-1"
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
      >
        <ReactFlow<FlowNode>
          nodes={nodes}
          edges={toEdges(topology)}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onNodeDragStop={onNodeDragStop}
          onNodeClick={(_, node) =>
            setSelection(
              node.id.startsWith("c:")
                ? { kind: "container", id: node.id.slice(2) }
                : node.id === `z:${EXTERNAL_ID}`
                  ? null
                  : { kind: "zone", id: node.id.slice(2) },
            )
          }
          onPaneClick={() => setSelection(null)}
          nodesConnectable={false}
          minZoom={0.2}
          proOptions={{ hideAttribution: true }}
          deleteKeyCode={null}
        >
          <Background variant={BackgroundVariant.Lines} gap={24} color="var(--nx-grid)" />
          <Controls showInteractive={false} />
          <MiniMap
            pannable
            zoomable
            nodeColor="var(--nx-accent)"
            maskColor="transparent"
            style={{ background: "var(--nx-bg-1)" }}
            bgColor="var(--nx-bg-1)"
          />
        </ReactFlow>
        <div className="absolute left-4 top-4 flex gap-2">
          <Button onClick={relayout}>
            <LayoutGrid size={14} /> {t("topology.autoLayout")}
          </Button>
        </div>
        {containers.length === 0 && (
          <p className="pointer-events-none absolute inset-x-0 bottom-8 text-center text-sm text-dim">
            {t("topology.empty")}
          </p>
        )}
      </div>
      <Inspector
        selection={selection}
        containers={containers}
        networks={networks}
        onClearSelection={() => setSelection(null)}
      />

      <DeployDialog target={deploy} onClose={() => setDeploy(null)} />
      <NetworkDialog open={newNetwork} onClose={() => setNewNetwork(false)} />
      <ConfirmDialog
        open={pendingMove !== null}
        danger={false}
        title={t("topology.moveTitle")}
        body={
          pendingMove
            ? t("topology.moveBody", {
                container: pendingMove.container.name,
                from: label(pendingMove.from),
                to: label(pendingMove.to),
              })
            : ""
        }
        command={pendingMove?.steps
          .map((s) =>
            s.op === "connect"
              ? cli.connect(s.networkName, pendingMove.container.name)
              : cli.disconnect(s.networkName, pendingMove.container.name),
          )
          .join("\n")}
        onConfirm={() => pendingMove && move.mutate(pendingMove)}
        onClose={() => {
          setPendingMove(null);
          relayout();
        }}
      />
    </div>
  );
}

export function TopologyPage() {
  return (
    <ReactFlowProvider>
      <Canvas />
    </ReactFlowProvider>
  );
}
