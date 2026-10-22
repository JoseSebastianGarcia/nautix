import {
  addNamedVolume,
  addNetwork,
  addService,
  type ComposeModel,
  setServiceList,
} from "@nautix/compose";
import type { Container, Template } from "@nautix/contracts";
import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  Controls,
  type Node,
  type NodeChange,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCatalog } from "../../app/queries.js";
import { randomSecret, uniqueName } from "../topology/deploy.js";
import { type FlowNode, nodeTypes, toEdges, toNodes } from "../topology/flow-graph.js";
import { EXTERNAL_ID, layoutTopology, NODE_H, NODE_W, zoneAt } from "../topology/layout.js";
import { CUSTOM_TEMPLATE_ID, DRAG_TYPE, Palette } from "../topology/palette.js";
import { PanelTab } from "../topology/panel-tab.js";
import { buildComposeGraph, DEFAULT_BOX, serviceIdToName } from "./compose-graph.js";
import { ComposeNetworkDialog, CustomImageDialog } from "./compose-network-dialog.js";
import { type ComposeSelection, useComposeStore } from "./compose-store.js";
import { templateToService } from "./service-templates.js";

const NO_STATES: ReadonlyMap<string, Container["state"]> = new Map();

function Canvas({
  model,
  states,
  readOnly,
}: {
  model: ComposeModel;
  states: ReadonlyMap<string, Container["state"]>;
  readOnly: boolean;
}) {
  const { t } = useTranslation();
  const flow = useReactFlow();
  const { data: catalog = [] } = useCatalog();
  const edit = useComposeStore((s) => s.edit);
  const select = useComposeStore((s) => s.select);

  const graph = useMemo(() => buildComposeGraph(model, states), [model, states]);
  const topology = useMemo(() => layoutTopology(graph.containers, graph.networks), [graph]);
  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [newNetwork, setNewNetwork] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(true);
  const [custom, setCustom] = useState<{ box?: string } | null>(null);

  useEffect(() => {
    setNodes(toNodes(topology, graph.containers, false));
  }, [topology, graph.containers]);
  const relayout = useCallback(
    () => setNodes(toNodes(topology, graph.containers, false)),
    [topology, graph.containers],
  );

  const edges = useMemo(
    () => [...toEdges(topology), ...graph.dependencyEdges],
    [topology, graph.dependencyEdges],
  );

  const usedHostPorts = useMemo(() => {
    const used = new Set<number>();
    for (const s of model.services) {
      for (const p of s.ports) {
        const host = Number.parseInt(p.split(":").slice(-2, -1)[0] ?? "", 10);
        if (!Number.isNaN(host)) used.add(host);
      }
    }
    return used;
  }, [model.services]);

  const addFromTemplate = useCallback(
    (template: Template, box: string | undefined) => {
      const name = uniqueName(
        template.id,
        model.services.map((s) => s.name),
      );
      const svc = templateToService(template, name, {
        usedHostPorts,
        random: randomSecret,
        ...(box && box !== DEFAULT_BOX ? { box } : {}),
      });
      edit((doc) => {
        addService(doc, svc.name, svc.definition);
        for (const v of svc.volumes) addNamedVolume(doc, v);
      });
      select({ kind: "service", name });
    },
    [edit, model.services, select, usedHostPorts],
  );

  const addCustom = useCallback(
    (image: string, box: string | undefined) => {
      const base =
        image
          .split("/")
          .pop()
          ?.split(":")[0]
          ?.replace(/[^a-zA-Z0-9_.-]/g, "") || "app";
      const name = uniqueName(
        base,
        model.services.map((s) => s.name),
      );
      edit((doc) =>
        addService(doc, name, {
          image,
          restart: "unless-stopped",
          ...(box && box !== DEFAULT_BOX ? { networks: [box] } : {}),
        }),
      );
      select({ kind: "service", name });
    },
    [edit, model.services, select],
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      if (readOnly) return;
      const id = event.dataTransfer.getData(DRAG_TYPE);
      if (!id) return;
      const point = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const zone = zoneAt(topology.zones, point.x, point.y);
      const box = zone?.network?.name;
      if (id === CUSTOM_TEMPLATE_ID) return setCustom(box ? { box } : {});
      const template = catalog.find((c) => c.id === id);
      if (template) addFromTemplate(template, box);
    },
    [flow, topology.zones, catalog, addFromTemplate, readOnly],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange<FlowNode>[]) => setNodes((current) => applyNodeChanges(changes, current)),
    [],
  );

  const onNodeDragStop = useCallback(
    (_: unknown, node: Node) => {
      const current = topology.placements.find((p) => `c:${p.containerId}` === node.id);
      const currentZone = topology.zones.find((z) => z.id === current?.zoneId);
      if (!current || !currentZone) return relayout();
      const target = zoneAt(
        topology.zones,
        currentZone.x + node.position.x + NODE_W / 2,
        currentZone.y + node.position.y + NODE_H / 2,
      );
      // Only moves between network boxes change the file; everything else snaps back.
      if (!target || target.id === current.zoneId || target.id === EXTERNAL_ID) return relayout();
      const name = serviceIdToName(current.containerId);
      edit((doc) =>
        setServiceList(doc, name, "networks", target.id === DEFAULT_BOX ? [] : [target.id]),
      );
    },
    [topology, relayout, edit],
  );

  const onNodeClick = useCallback(
    (_: unknown, node: Node) => {
      if (node.id.startsWith("c:"))
        select({ kind: "service", name: serviceIdToName(node.id.slice(2)) });
      else if (node.id !== `z:${EXTERNAL_ID}`) select({ kind: "network", name: node.id.slice(2) });
      else select(null);
    },
    [select],
  );

  return (
    <div className="flex h-full min-h-0">
      {!readOnly && (
        <Palette
          open={paletteOpen}
          onNewNetwork={() => setNewNetwork(true)}
          onPick={(t) => (t === "custom" ? setCustom({}) : addFromTemplate(t, undefined))}
        />
      )}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: HTML5 drop target for palette items */}
      <div
        className="relative min-w-0 flex-1"
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
      >
        <ReactFlow<FlowNode>
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onNodeDragStop={onNodeDragStop}
          onNodeClick={onNodeClick}
          onPaneClick={() => {
            select(null);
            setPaletteOpen(false);
          }}
          nodesConnectable={false}
          nodesDraggable={!readOnly}
          minZoom={0.2}
          fitView
          fitViewOptions={{ padding: 0.1, maxZoom: 1 }}
          proOptions={{ hideAttribution: true }}
          deleteKeyCode={null}
        >
          <Background variant={BackgroundVariant.Lines} gap={24} color="var(--nx-grid)" />
          <Controls showInteractive={false} />
        </ReactFlow>
        {!readOnly && (
          <PanelTab
            side="left"
            open={paletteOpen}
            label={t(paletteOpen ? "topology.paletteHide" : "topology.paletteShow")}
            onClick={() => setPaletteOpen((o) => !o)}
          />
        )}
      </div>
      <ComposeNetworkDialog
        open={newNetwork}
        taken={model.networks.map((n) => n.name)}
        onCreate={(name, internal, subnet) => {
          edit((doc) => addNetwork(doc, name, { internal, ...(subnet ? { subnet } : {}) }));
          select({ kind: "network", name });
        }}
        onClose={() => setNewNetwork(false)}
      />
      <CustomImageDialog
        open={custom !== null}
        onAdd={(image) => addCustom(image, custom?.box)}
        onClose={() => setCustom(null)}
      />
    </div>
  );
}

export function ComposeCanvas(props: {
  model: ComposeModel;
  states?: ReadonlyMap<string, Container["state"]>;
  readOnly: boolean;
}) {
  return (
    <ReactFlowProvider>
      <Canvas model={props.model} states={props.states ?? NO_STATES} readOnly={props.readOnly} />
    </ReactFlowProvider>
  );
}

export type { ComposeSelection };
