import type { Container, Layout, Network, Template } from "@nautix/contracts";
import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  Controls,
  type Edge,
  type Node,
  type NodeChange,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useQueryClient } from "@tanstack/react-query";
import { FileDown, LayoutGrid } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../app/api.js";
import { cli } from "../../app/cli.js";
import {
  keys,
  useCatalog,
  useContainers,
  useIsAdmin,
  useLayout,
  useNetworks,
} from "../../app/queries.js";
import { useApiMutation } from "../../app/use-api-mutation.js";
import { Button, ConfirmDialog } from "../../components/ui.js";
import { DeployDialog, type DeployTarget } from "./deploy-dialog.js";
import { ExportDialog, type ExportTarget } from "./export-dialog.js";
import { type FlowNode, nodeTypes, toEdges, toNodes } from "./flow-graph.js";
import { Inspector, type Selection } from "./inspector.js";
import {
  EXTERNAL_ID,
  layoutTopology,
  NODE_H,
  NODE_W,
  type Topology,
  zoneAt,
  zoneKey,
} from "./layout.js";
import { type MoveStep, planMove } from "./move-plan.js";
import { NetworkDialog } from "./network-dialog.js";
import { CUSTOM_TEMPLATE_ID, DRAG_TYPE, Palette } from "./palette.js";

const NO_CONTAINERS: Container[] = [];
const NO_NETWORKS: Network[] = [];
const NO_TEMPLATES: Template[] = [];
const EMPTY_LAYOUT: Layout = { zones: {}, nodes: {} };

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
  const isAdmin = useIsAdmin();

  const { data: savedLayout = EMPTY_LAYOUT } = useLayout();
  const qc = useQueryClient();
  const saveLayout = useApiMutation((layout: Layout) => api.saveLayout(layout), []);
  const persist = useCallback(
    (next: Layout) => {
      qc.setQueryData(keys.layout, next);
      saveLayout.mutate(next);
    },
    [qc, saveLayout],
  );
  const topology = useMemo(
    () => layoutTopology(containers, networks, savedLayout),
    [containers, networks, savedLayout],
  );
  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [selection, setSelection] = useState<Selection>(null);
  const [deploy, setDeploy] = useState<DeployTarget | null>(null);
  const [newNetwork, setNewNetwork] = useState(false);
  const [exporting, setExporting] = useState<ExportTarget | null>(null);
  const [resetting, setResetting] = useState(false);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);

  // Re-sync from engine data whenever it changes (drag offsets are intentionally discarded).
  const fitted = useRef(false);
  useEffect(() => {
    setNodes(toNodes(topology, containers, isAdmin));
    if (!fitted.current && containers.length > 0) {
      fitted.current = true;
      requestAnimationFrame(() => void flow.fitView({ padding: 0.1, maxZoom: 1 }));
    }
  }, [topology, containers, flow, isAdmin]);

  const relayout = useCallback(
    () => setNodes(toNodes(topology, containers, isAdmin)),
    [topology, containers, isAdmin],
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
      // Dragging a box: remember where it is.
      if (node.id.startsWith("z:")) {
        const zone = topology.zones.find((z) => `z:${z.id}` === node.id);
        if (zone) {
          persist({
            ...savedLayout,
            zones: {
              ...savedLayout.zones,
              [zoneKey(zone)]: { x: node.position.x, y: node.position.y },
            },
          });
        }
        return;
      }
      const id = node.id.slice(2);
      const container = containers.find((c) => c.id === id);
      const current = topology.placements.find((p) => p.containerId === id);
      const currentZone = topology.zones.find((z) => z.id === current?.zoneId);
      if (!container || !current || !currentZone) return relayout();
      // `node.position` is relative to its box; the drop point decides which box it landed in.
      const absX = currentZone.x + node.position.x;
      const absY = currentZone.y + node.position.y;
      const target = zoneAt(topology.zones, absX + NODE_W / 2, absY + NODE_H / 2);
      if (!target) return relayout();
      if (target.id === current.zoneId) {
        // Same box: just remember the new spot.
        persist({
          ...savedLayout,
          nodes: {
            ...savedLayout.nodes,
            [container.name]: { x: node.position.x, y: node.position.y },
          },
        });
        return;
      }
      const from = currentZone.network;
      const to = target.network;
      const steps = planMove(container, networks, from, to);
      if (steps.length === 0) return relayout();
      setPendingMove({ container, from, to, steps });
    },
    [containers, networks, topology, relayout, persist, savedLayout],
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
          nodesDraggable={isAdmin}
          minZoom={0.2}
          proOptions={{ hideAttribution: true }}
          deleteKeyCode={null}
        >
          <Background variant={BackgroundVariant.Lines} gap={24} color="var(--nx-grid)" />
          <Controls showInteractive={false} />
        </ReactFlow>
        <div className="absolute left-4 top-4 flex gap-2">
          <Button write onClick={() => setResetting(true)}>
            <LayoutGrid size={14} /> {t("topology.autoLayout")}
          </Button>
          <Button onClick={() => setExporting({ networkId: undefined, label: undefined })}>
            <FileDown size={14} /> {t("topology.exportButton")}
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
        onExport={setExporting}
      />

      <DeployDialog target={deploy} onClose={() => setDeploy(null)} />
      <ConfirmDialog
        open={resetting}
        danger={false}
        title={t("topology.resetLayoutTitle")}
        body={t("topology.resetLayoutBody")}
        onConfirm={() => persist(EMPTY_LAYOUT)}
        onClose={() => setResetting(false)}
      />
      <ExportDialog target={exporting} onClose={() => setExporting(null)} />
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
        onConfirm={() => {
          if (!pendingMove) return;
          const { [pendingMove.container.name]: _old, ...rest } = savedLayout.nodes;
          persist({ ...savedLayout, nodes: rest });
          move.mutate(pendingMove);
        }}
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
