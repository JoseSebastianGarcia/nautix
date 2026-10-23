import type {
  Layout,
  Network,
  SwarmBinding,
  SwarmNode,
  SwarmPlacement,
  Template,
} from "@nautix/contracts";
import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  type Connection,
  ConnectionMode,
  Controls,
  type Edge,
  Handle,
  type Node,
  type NodeChange,
  type NodeProps,
  Position,
  ReactFlow,
  useReactFlow,
} from "@xyflow/react";
import { CanvasWatermark } from "../../components/canvas-watermark.js";
import "@xyflow/react/dist/style.css";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HardDrive, KeyRound, Minus, Pin, Plus, Trash2, Undo2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { api } from "../../app/api.js";
import { cli } from "../../app/cli.js";
import { keys, useCatalog, useIsAdmin, useLayout, useNetworks } from "../../app/queries.js";
import { useApiMutation } from "../../app/use-api-mutation.js";
import { useToasts } from "../../components/toast-store.js";
import { Button, ConfirmDialog, Dialog, Field, Input, ShowCommand } from "../../components/ui.js";
import type { ClusterModel, ClusterService } from "./cluster-model.js";
import { ServiceDetails } from "./cluster-view.js";
import { type Rect, sidesBetween } from "./edge-sides.js";
import { EXTERNAL_ID, layoutTopology, NODE_H, NODE_W, type Placeable, zoneAt } from "./layout.js";
import { LogoBadge } from "./logo-badge.js";
import { NetworkDialog } from "./network-dialog.js";
import { type ZoneFlowNode, ZoneNode } from "./nodes.js";
import { CUSTOM_TEMPLATE_ID, DRAG_TYPE, Palette } from "./palette.js";
import { PanelTab } from "./panel-tab.js";
import { ShortcutHints } from "./shortcut-hints.js";
import { SideHandles } from "./side-handles.js";
import { type BindTarget, SwarmBindDialog } from "./swarm-bind-dialog.js";
import {
  applyPlan,
  effectiveNetworks,
  itemServiceId,
  type PlanItem,
  type PlannedBind,
  type PlannedCreate,
  type PlannedUnbind,
  type PlanResult,
  planCommands,
  planImage,
  planMove,
  plannedNames,
  planPlacement,
  planRemove,
  planScale,
  upsertUpdate,
} from "./swarm-plan.js";
import {
  type PlacementMode,
  placementOf,
  type ServiceTarget,
  SwarmServiceDialog,
} from "./swarm-service-dialog.js";
import { ServiceSettings } from "./swarm-service-settings.js";
import { useCanvasPanels } from "./use-canvas-panels.js";
import { useCanvasShortcuts } from "./use-canvas-shortcuts.js";

const EMPTY_LAYOUT: Layout = { zones: {}, nodes: {} };
const NO_TEMPLATES: Template[] = [];
const NO_NETWORKS: Network[] = [];
const NO_BINDINGS: SwarmBinding[] = [];
const NO_NAMES: { id: string; name: string }[] = [];

/** Services are saved in the layout under their own prefix so they never clash with container names. */
const nodeKey = (name: string): string => `svc:${name}`;

interface ServiceNodeData extends Record<string, unknown> {
  existing: ClusterService | null;
  planned: PlannedCreate | null;
  /** Replicas the plan will leave, when it changes them. */
  scaleTo: number | null;
  /** Any other change waiting in the plan (image, placement, networks). */
  changed: boolean;
  removing: boolean;
  /** The person may draw a binding from this service to another. */
  canBind: boolean;
  /** Where each copy runs: the server's colour and name, and whether the copy is well. */
  where: { color: string; host: string; ok: boolean }[];
}
type ServiceFlowNode = Node<ServiceNodeData, "service">;

/** One colour per server, from hues that never stand for ok, warning or error, so a node's copies can be told apart at a glance. */
const SERVER_HUES = [210, 280, 180, 320, 250, 195, 300, 230];
const serverColor = (index: number): string =>
  `hsl(${SERVER_HUES[index % SERVER_HUES.length] ?? 210} 65% 62%)`;

/** A dot on the edge of the node: drag from one service's dot to another's to bind them. */
const BIND_HANDLE = {
  width: 12,
  height: 12,
  background: "var(--nx-accent)",
  border: "2px solid var(--nx-bg-1)",
} as const;
const HIDDEN_HANDLE = { opacity: 0, pointerEvents: "none" as const };

const HEALTH_TEXT = { ok: "text-ok", degraded: "text-amber", down: "text-danger" } as const;

function ServiceNode({ data, selected }: NodeProps<ServiceFlowNode>) {
  const { t } = useTranslation();
  const { existing, planned, scaleTo, changed, removing } = data;
  const name = planned?.spec.name ?? existing?.service.name ?? "";
  const image = planned?.spec.image ?? existing?.service.image ?? "";
  const running = existing?.placements.filter((p) => p.state === "ok").length ?? 0;
  const desired = planned
    ? planned.spec.global
      ? t("cluster.global")
      : String(planned.spec.replicas ?? 1)
    : existing?.service.mode === "global"
      ? t("cluster.global")
      : String(existing?.service.desired ?? 0);
  const published = planned?.spec.ports?.length ?? existing?.service.ports.length ?? 0;
  const placement: SwarmPlacement = planned?.spec.placement ?? existing?.service.placement ?? {};
  const mounts = planned?.spec.mounts?.length ?? existing?.service.mounts.length ?? 0;
  const secrets = planned?.spec.secrets?.length ?? existing?.service.secrets.length ?? 0;
  const rolledBack = existing?.service.update.state?.startsWith("rollback") === true;
  const pending = planned !== null || scaleTo !== null || changed || removing;
  return (
    <div
      style={{
        width: NODE_W,
        height: NODE_H,
        boxShadow: selected ? "var(--nx-glow)" : undefined,
        opacity: removing ? 0.55 : 1,
      }}
      className={`relative flex items-center gap-3 rounded-xl border bg-bg1 px-3 ${removing ? "border-dashed border-danger" : pending ? "border-dashed border-accent" : "border-line"} ${selected && !removing && !pending ? "nx-selected" : ""}`}
    >
      <SideHandles
        prefix="bind"
        connectable={data.canBind}
        visibleStyle={BIND_HANDLE}
        label={t("swarmCanvas.bindDrag")}
      />
      <LogoBadge image={image} name={name} />
      {data.where.length > 0 && (
        <span className="absolute right-2 top-1.5 flex gap-0.5">
          {data.where.map((w, i) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: copies have no id of their own here
              key={i}
              title={w.host}
              role="img"
              aria-label={w.host}
              className="h-1.5 w-1.5 rounded-full"
              style={w.ok ? { background: w.color } : { border: `1px solid ${w.color}` }}
            />
          ))}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`truncate text-sm font-semibold ${removing ? "line-through" : ""}`}>
            {name}
          </span>
          {pending && (
            <span
              className={`rounded px-1 text-[10px] font-semibold ${removing ? "bg-danger/20 text-danger" : "bg-accent-soft text-accent"}`}
            >
              {removing
                ? t("swarmCanvas.removing")
                : planned
                  ? t("swarmCanvas.new")
                  : t("swarmCanvas.changed")}
            </span>
          )}
        </div>
        <div className="truncate font-mono text-[11px] text-dim">{image}</div>
        <div className="mt-0.5 flex items-center gap-2 text-[10px]">
          {existing && !planned && (
            <span className={HEALTH_TEXT[existing.health]}>
              ● {running}/{existing.service.desired}
            </span>
          )}
          <span className="text-dim">
            {scaleTo !== null ? `${t("cluster.replicas")} → ${scaleTo}` : `× ${desired}`}
          </span>
          {published > 0 && (
            <span className="text-amber">
              {t("swarmCanvas.publishedShort", { count: published })}
            </span>
          )}
          <span className="ml-auto flex items-center gap-1.5 text-dim">
            {(placement.nodeId || placement.role) && (
              <Pin size={11} aria-label={t("swarmCanvas.placement")}>
                <title>{t("swarmCanvas.placement")}</title>
              </Pin>
            )}
            {mounts > 0 && (
              <HardDrive size={11} aria-label={t("swarmCanvas.volumes")}>
                <title>{t("swarmCanvas.volumes")}</title>
              </HardDrive>
            )}
            {secrets > 0 && (
              <KeyRound size={11} aria-label={t("swarmCanvas.secrets")}>
                <title>{t("swarmCanvas.secrets")}</title>
              </KeyRound>
            )}
            {rolledBack && <span className="text-amber">↺</span>}
          </span>
        </div>
      </div>
    </div>
  );
}

const nodeTypes = { zone: ZoneNode, service: ServiceNode };
type FlowNode = ZoneFlowNode | ServiceFlowNode;

type Selection =
  | { kind: "service"; id: string }
  | { kind: "planned"; key: string }
  | { kind: "overlay"; id: string }
  | null;

interface Item extends Placeable {
  existing: ClusterService | null;
  planned: PlannedCreate | null;
}

/** Services as the layout sees them: the real ones, where the plan will leave them, plus the ones it creates. */
const toItems = (model: ClusterModel, plan: PlanItem[]): Item[] => [
  ...model.services.map((s) => ({
    id: s.service.id,
    name: nodeKey(s.service.name),
    networks: effectiveNetworks(s.networks, plan, s.service.id),
    existing: s,
    planned: null,
  })),
  ...plan.flatMap((p) =>
    p.kind === "create"
      ? [
          {
            id: `plan:${p.key}`,
            name: nodeKey(p.spec.name),
            networks: p.network ? [p.network] : [],
            existing: null,
            planned: p,
          },
        ]
      : [],
  ),
];

export function SwarmCanvas({ model }: { model: ClusterModel }) {
  const { t } = useTranslation();
  const isAdmin = useIsAdmin();
  const flow = useReactFlow();
  const qc = useQueryClient();
  const push = useToasts((s) => s.push);
  const { data: networks = NO_NETWORKS } = useNetworks();
  const { data: catalog = NO_TEMPLATES } = useCatalog();
  const { data: saved = EMPTY_LAYOUT } = useLayout();
  const { data: secrets = NO_NAMES } = useQuery({
    queryKey: ["swarm-secrets"],
    queryFn: api.swarmSecrets,
  });
  const { data: configs = NO_NAMES } = useQuery({
    queryKey: ["swarm-configs"],
    queryFn: api.swarmConfigs,
  });
  const { data: bindings = NO_BINDINGS } = useQuery({
    queryKey: ["swarm-bindings"],
    queryFn: api.swarmBindings,
  });
  const saveLayout = useApiMutation((layout: Layout) => api.saveLayout(layout), []);
  const persist = useCallback(
    (next: Layout) => {
      qc.setQueryData(keys.layout, next);
      saveLayout.mutate(next);
    },
    [qc, saveLayout],
  );

  const [plan, setPlan] = useState<PlanItem[]>([]);
  const [selection, setSelection] = useState<Selection>(null);
  const panels = useCanvasPanels(selection !== null);
  const [target, setTarget] = useState<ServiceTarget | null>(null);
  const [newNetwork, setNewNetwork] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [bindTarget, setBindTarget] = useState<BindTarget | null>(null);
  const [nodes, setNodes] = useState<FlowNode[]>([]);

  const swarmNodes = useMemo(() => model.servers.map((s) => s.node), [model.servers]);
  const serverIndex = useMemo(
    () => new Map(model.servers.map((c, i) => [c.node.id, i] as const)),
    [model.servers],
  );
  const overlays = useMemo(
    () => networks.filter((n) => n.driver === "overlay" && !n.system),
    [networks],
  );
  const items = useMemo(() => toItems(model, plan), [model, plan]);
  const topology = useMemo(() => layoutTopology(items, overlays, saved), [items, overlays, saved]);
  const scaleOf = useMemo(
    () => new Map(plan.flatMap((p) => (p.kind === "scale" ? [[p.serviceId, p.to] as const] : []))),
    [plan],
  );
  const changedIds = useMemo(
    () => new Set(plan.flatMap((p) => (p.kind === "update" ? [p.serviceId] : []))),
    [plan],
  );
  const removingIds = useMemo(
    () => new Set(plan.flatMap((p) => (p.kind === "remove" ? [p.serviceId] : []))),
    [plan],
  );

  const build = useCallback((): FlowNode[] => {
    const byId = new Map(items.map((i) => [i.id, i]));
    const zones: ZoneFlowNode[] = topology.zones
      .filter((z) => z.network !== null || z.containerIds.length > 0)
      .map((z) => ({
        id: `z:${z.id}`,
        type: "zone",
        position: { x: z.x, y: z.y },
        data: {
          network: z.network,
          count: z.containerIds.length,
          noTunnel: true,
          w: z.w,
          h: z.h,
          ...(z.network === null
            ? { label: t("cluster.loose"), hint: t("swarmCanvas.looseHint") }
            : { hint: t("swarmCanvas.emptyOverlay") }),
        },
        draggable: isAdmin,
        zIndex: -1,
        width: z.w,
        height: z.h,
      }));
    const svc: ServiceFlowNode[] = topology.placements.flatMap((p) => {
      const item = byId.get(p.containerId);
      const zone = topology.zones.find((z) => z.id === p.zoneId);
      if (!item || !zone) return [];
      return [
        {
          id: `s:${item.id}`,
          type: "service" as const,
          parentId: `z:${p.zoneId}`,
          position: { x: p.x - zone.x, y: p.y - zone.y },
          data: {
            existing: item.existing,
            planned: item.planned,
            scaleTo: item.existing ? (scaleOf.get(item.existing.service.id) ?? null) : null,
            changed: item.existing ? changedIds.has(item.existing.service.id) : false,
            removing: item.existing ? removingIds.has(item.existing.service.id) : false,
            where: (item.existing?.placements ?? []).map((p) => ({
              color: serverColor(Math.max(0, serverIndex.get(p.task.nodeId) ?? 0)),
              host: p.node?.hostname ?? t("cluster.unknownNode"),
              ok: p.state === "ok",
            })),
            canBind:
              isAdmin && item.existing !== null && !removingIds.has(item.existing.service.id),
          },
          zIndex: 1,
          draggable: isAdmin,
          width: NODE_W,
          height: NODE_H,
        },
      ];
    });
    return [...zones, ...svc];
  }, [items, topology, isAdmin, scaleOf, changedIds, removingIds, serverIndex, t]);

  const fitted = useRef(false);
  useEffect(() => {
    setNodes(build());
    if (!fitted.current && model.services.length + overlays.length > 0) {
      fitted.current = true;
      requestAnimationFrame(
        () =>
          void flow.fitView({
            padding: { top: 0.1, left: 0.1, bottom: 0.1, right: "344px" },
            maxZoom: 1,
          }),
      );
    }
  }, [build, model.services.length, overlays.length, flow]);

  // A service on two overlays is drawn in the first and linked to the other; bindings are the labelled lines.
  const edges = useMemo<Edge[]>(() => {
    const idOf = new Map(model.services.map((x) => [x.service.name, x.service.id]));
    const label = {
      labelStyle: { fill: "var(--nx-text)", fontFamily: "var(--font-mono)", fontSize: 11 },
      labelBgStyle: { fill: "var(--nx-bg-1)", stroke: "var(--nx-line)" },
      labelBgPadding: [6, 3] as [number, number],
      labelBgBorderRadius: 6,
    };
    const unbinding = new Set(plan.flatMap((p) => (p.kind === "unbind" ? [p.bindingId] : [])));
    // Lines leave and arrive by the sides that face the other box.
    const spot = new Map(
      topology.placements.map(
        (p) => [p.containerId, { x: p.x, y: p.y, w: NODE_W, h: NODE_H }] as const,
      ),
    );
    const sidesOf = (a: string, b: string) => {
      const from = spot.get(a);
      const to = spot.get(b);
      return from && to
        ? sidesBetween(from, to)
        : { source: "right" as const, target: "left" as const };
    };
    const line = (
      id: string,
      from: string | undefined,
      to: string | undefined,
      text: string,
      pending: boolean,
      removing = false,
    ): Edge[] =>
      from && to
        ? [
            {
              id,
              source: `s:${from}`,
              target: `s:${to}`,
              sourceHandle: `bind-${sidesOf(from, to).source}`,
              targetHandle: `bind-${sidesOf(from, to).target}`,
              label: text,
              ...label,
              style: {
                stroke: removing ? "var(--nx-danger)" : "var(--nx-accent)",
                strokeWidth: 2.5,
                ...(pending || removing ? { strokeDasharray: "6 4" } : {}),
              },
              markerEnd: {
                type: "arrowclosed" as const,
                color: removing ? "var(--nx-danger)" : "var(--nx-accent)",
              },
            },
          ]
        : [];
    return [
      ...topology.links.map((l) => {
        const zone = topology.zones.find((z) => z.id === l.zoneId);
        const from = spot.get(l.containerId);
        const sides = zone && from ? sidesBetween(from, zone as Rect) : undefined;
        return {
          id: `l:${l.containerId}:${l.zoneId}`,
          source: `s:${l.containerId}`,
          target: `z:${l.zoneId}`,
          ...(sides
            ? { sourceHandle: `bind-${sides.source}`, targetHandle: `tunnel-${sides.target}` }
            : {}),
          animated: true,
          style: { strokeDasharray: "6 4", stroke: "var(--nx-accent)" },
        };
      }),
      ...bindings.flatMap((b) =>
        line(
          `b:${b.id}`,
          idOf.get(b.consumer),
          idOf.get(b.provider),
          b.kind,
          false,
          unbinding.has(b.id),
        ),
      ),
      ...plan.flatMap((p) =>
        p.kind === "bind"
          ? line(
              `pb:${p.key}`,
              p.consumer.id,
              p.provider.id,
              `${p.name} (${t("swarmCanvas.new")})`,
              true,
            )
          : [],
      ),
    ];
  }, [topology.links, topology.placements, topology.zones, model.services, bindings, plan, t]);

  const onNodesChange = useCallback(
    (changes: NodeChange<FlowNode>[]) => setNodes((cur) => applyNodeChanges(changes, cur)),
    [],
  );

  const onNodeDragStop = useCallback(
    (_: unknown, node: Node) => {
      if (node.id.startsWith("z:")) {
        const zone = topology.zones.find((z) => `z:${z.id}` === node.id);
        const key = zone?.network?.name ?? EXTERNAL_ID;
        persist({
          ...saved,
          zones: { ...saved.zones, [key]: { x: node.position.x, y: node.position.y } },
        });
        return;
      }
      const item = items.find((i) => `s:${i.id}` === node.id);
      const placed = topology.placements.find((p) => p.containerId === item?.id);
      const home = topology.zones.find((z) => z.id === placed?.zoneId);
      if (!item || !home) return;
      // Dropped on another box: the service moves to that overlay (a change in the plan, not done yet).
      const target = zoneAt(
        topology.zones,
        home.x + node.position.x + NODE_W / 2,
        home.y + node.position.y + NODE_H / 2,
      );
      if (target && target.id !== home.id) {
        const from = home.network?.name ?? null;
        const to = target.network?.name ?? null;
        if (item.existing) {
          const svc = item.existing.service;
          setPlan((cur) => upsertUpdate(cur, svc, planMove(from, to)));
        } else if (item.planned) {
          const planned = item.planned;
          setPlan((cur) =>
            cur.map((p) =>
              p === planned
                ? { ...planned, network: to, spec: { ...planned.spec, networks: to ? [to] : [] } }
                : p,
            ),
          );
        }
        // Forget the spot it had in the old box so it lands in the free place of the new one.
        const { [item.name]: _gone, ...rest } = saved.nodes;
        persist({ ...saved, nodes: rest });
        return;
      }
      persist({
        ...saved,
        nodes: { ...saved.nodes, [item.name]: { x: node.position.x, y: node.position.y } },
      });
    },
    [topology.zones, topology.placements, items, persist, saved],
  );

  const onConnect = useCallback(
    (c: Connection) => {
      const find = (nodeId: string) =>
        model.services.find((x) => `s:${x.service.id}` === nodeId)?.service;
      const consumer = find(c.source);
      const provider = find(c.target);
      if (consumer && provider && consumer.id !== provider.id)
        setBindTarget({
          consumer: { id: consumer.id, name: consumer.name },
          provider: { id: provider.id, name: provider.name },
        });
    },
    [model.services],
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const id = event.dataTransfer.getData(DRAG_TYPE);
      if (!id) return;
      const point = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const zone = zoneAt(topology.zones, point.x, point.y);
      const template =
        id === CUSTOM_TEMPLATE_ID ? CUSTOM_TEMPLATE_ID : catalog.find((c) => c.id === id);
      if (template) setTarget({ template, network: zone?.network ?? null });
    },
    [flow, topology.zones, catalog],
  );

  const selectedService =
    selection?.kind === "service"
      ? (model.services.find((s) => s.service.id === selection.id) ?? null)
      : null;
  const selectedOverlay =
    selection?.kind === "overlay" ? (overlays.find((n) => n.id === selection.id) ?? null) : null;
  const selectedPlanned =
    selection?.kind === "planned"
      ? (plan.find((p): p is PlannedCreate => p.kind === "create" && p.key === selection.key) ??
        null)
      : null;

  // A drawn-but-not-applied service has no inspector component of its own, so its shortcut lives here.
  useCanvasShortcuts({
    remove: selectedPlanned
      ? () => {
          setPlan((cur) => cur.filter((p) => p !== selectedPlanned));
          setSelection(null);
        }
      : undefined,
  });

  return (
    <div className="relative flex h-full min-h-0">
      <Palette
        open={panels.paletteOpen}
        onNewNetwork={() => setNewNetwork(true)}
        onPick={(template) => setTarget({ template, network: null })}
      />
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
          connectionMode={ConnectionMode.Loose}
          onNodesChange={onNodesChange}
          onNodeDragStop={onNodeDragStop}
          onNodeClick={(_, node) => {
            if (node.id.startsWith("z:")) {
              const id = node.id.slice(2);
              return setSelection(id === EXTERNAL_ID ? null : { kind: "overlay", id });
            }
            if (!node.id.startsWith("s:")) return setSelection(null);
            const id = node.id.slice(2);
            setSelection(
              id.startsWith("plan:")
                ? { kind: "planned", key: id.slice(5) }
                : { kind: "service", id },
            );
          }}
          onPaneClick={() => {
            setSelection(null);
            panels.hideAll();
          }}
          onConnect={onConnect}
          nodesConnectable={isAdmin}
          nodesDraggable={isAdmin}
          minZoom={0.2}
          proOptions={{ hideAttribution: true }}
          deleteKeyCode={null}
        >
          <CanvasWatermark />
          <Background variant={BackgroundVariant.Dots} gap={22} size={1.6} color="var(--nx-grid)" />
          <Controls showInteractive={false} />
        </ReactFlow>
        <PanelTab
          side="left"
          open={panels.paletteOpen}
          label={t(panels.paletteOpen ? "topology.paletteHide" : "topology.paletteShow")}
          onClick={() => panels.setPaletteOpen((o) => !o)}
        />
        <PanelTab
          side="right"
          open={panels.inspectorOpen}
          label={t(panels.inspectorOpen ? "topology.inspectorHide" : "topology.inspectorShow")}
          onClick={() => panels.setInspectorOpen((o) => !o)}
        />
        {model.servers.length > 0 && (
          <div className="absolute left-4 top-4 z-10 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-line bg-bg1 px-3 py-1.5 text-xs text-dim">
            <span>{t("swarmCanvas.servers")}</span>
            {model.servers.map((c, i) => (
              <span key={c.node.id} className="flex items-center gap-1 font-mono">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: serverColor(i) }}
                  aria-hidden="true"
                />
                {c.node.hostname}
              </span>
            ))}
          </div>
        )}
        {model.services.length === 0 && plan.length === 0 && (
          <p className="pointer-events-none absolute inset-x-0 top-16 pr-[22rem] text-center text-sm text-dim">
            {t("swarmCanvas.empty")}
          </p>
        )}
        {plan.length > 0 && (
          <div
            className={`nx-glass nx-lens-wide absolute bottom-4 z-10 ${panels.inspectorOpen ? "right-[22rem]" : "right-4"} flex items-center gap-3 rounded-full py-2 pl-5 pr-2 text-sm`}
          >
            <span className="h-2 w-2 rounded-full bg-accent" aria-hidden="true" />
            {t("swarmCanvas.pending", { count: plan.length })}
            <Button onClick={() => setPlan([])}>
              <Undo2 size={14} /> {t("swarmCanvas.discard")}
            </Button>
            <Button write variant="primary" onClick={() => setReviewing(true)}>
              {t("swarmCanvas.review")}
            </Button>
          </div>
        )}
      </div>
      {panels.inspectorOpen && (
        <aside
          aria-label={t("topology.inspector")}
          className="nx-glass nx-glass-dense nx-hairline nx-lens-tall absolute bottom-3 right-3 top-3 z-10 flex w-80 flex-col gap-3 overflow-y-auto rounded-3xl p-5"
        >
          <h2 className="font-mono text-xs uppercase tracking-wider text-dim">
            {t("topology.inspector")}
          </h2>
          {selectedService && (
            <ServiceInspector
              svc={selectedService}
              plan={plan}
              bindings={bindings}
              secretNames={secrets.map((x) => x.name)}
              configNames={configs.map((x) => x.name)}
              overlays={overlays}
              nodes={swarmNodes}
              onPlan={(change) => setPlan(change)}
              onRolledBack={() => void qc.invalidateQueries({ queryKey: keys.cluster })}
            />
          )}
          {selectedPlanned && (
            <>
              <p className="text-sm font-semibold">{selectedPlanned.spec.name}</p>
              <p className="font-mono text-xs text-dim">{selectedPlanned.spec.image}</p>
              <p className="text-xs text-dim">{t("swarmCanvas.plannedHint")}</p>
              <Button
                onClick={() => {
                  setPlan((cur) => cur.filter((p) => p !== selectedPlanned));
                  setSelection(null);
                }}
              >
                <Undo2 size={14} /> {t("swarmCanvas.removeFromPlan")}
              </Button>
            </>
          )}
          {selectedOverlay && (
            <OverlayInspector
              network={selectedOverlay}
              services={model.services}
              onGone={() => setSelection(null)}
            />
          )}
          {!selectedService && !selectedPlanned && !selectedOverlay && (
            <p className="text-sm text-dim">{t("cluster.inspectorEmpty")}</p>
          )}
          <ShortcutHints />
        </aside>
      )}
      <SwarmServiceDialog
        target={target}
        overlays={overlays}
        nodes={swarmNodes}
        secretNames={secrets.map((s) => s.name)}
        configNames={configs.map((c) => c.name)}
        taken={[...model.services.map((s) => s.service.name), ...plannedNames(plan)]}
        onAdd={(item) => {
          setPlan((cur) => [...cur, item]);
          setSelection({ kind: "planned", key: item.key });
        }}
        onClose={() => setTarget(null)}
      />
      <SwarmBindDialog
        target={bindTarget}
        onAdd={(item) =>
          setPlan((cur) => [...cur.filter((p) => !(p.kind === "bind" && p.key === item.key)), item])
        }
        onClose={() => setBindTarget(null)}
      />
      <NetworkDialog open={newNetwork} onClose={() => setNewNetwork(false)} />
      <PlanDialog
        open={reviewing}
        plan={plan}
        onClose={() => setReviewing(false)}
        onApplied={() => {
          setPlan([]);
          setSelection(null);
          push("ok", t("swarmCanvas.applied"));
          void qc.invalidateQueries({ queryKey: keys.cluster });
        }}
        onChanged={() => {
          void qc.invalidateQueries({ queryKey: keys.cluster });
          void qc.invalidateQueries({ queryKey: ["swarm-bindings"] });
        }}
      />
    </div>
  );
}

/** An overlay network box: what it is and, when nothing uses it, delete. Docker cannot edit a network in place. */
function OverlayInspector({
  network: n,
  services,
  onGone,
}: {
  network: Network;
  services: ClusterService[];
  onGone: () => void;
}) {
  const { t } = useTranslation();
  const isAdmin = useIsAdmin();
  const [confirm, setConfirm] = useState(false);
  const remove = useApiMutation(() => api.removeNetwork(n.id), [keys.networks, keys.cluster]);
  const members = services.filter((s) => s.networks.includes(n.name));
  const canRemove = isAdmin && members.length === 0;
  useCanvasShortcuts({ remove: canRemove ? () => setConfirm(true) : undefined });
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="font-semibold">{n.name}</div>
        <div className="font-mono text-xs text-dim">
          overlay · {n.subnet ?? "—"} ·{" "}
          {n.internal ? t("topology.isolated") : t("topology.bridged")}
        </div>
      </div>
      <p className="text-sm text-dim">{t("swarmCanvas.overlayHint")}</p>
      <ul className="flex flex-col gap-1">
        {members.map((s) => (
          <li
            key={s.service.id}
            className="flex items-center gap-2 rounded-lg bg-bg2 px-2 py-1 text-sm"
          >
            <LogoBadge image={s.service.image} name={s.service.name} size={20} />
            {s.service.name}
          </li>
        ))}
      </ul>
      <Button write variant="danger" disabled={!canRemove} onClick={() => setConfirm(true)}>
        <Trash2 size={14} /> {t("common.delete")}
      </Button>
      {members.length > 0 && <p className="text-xs text-dim">{t("swarmCanvas.overlayNotEmpty")}</p>}
      <ShowCommand command={cli.removeNetwork(n.name)} />
      <ConfirmDialog
        open={confirm}
        title={t("topology.removeNetworkTitle", { name: n.name })}
        body={t("topology.removeNetworkBody")}
        command={cli.removeNetwork(n.name)}
        onConfirm={() => remove.mutate(undefined, { onSuccess: onGone })}
        onClose={() => setConfirm(false)}
      />
    </div>
  );
}

/** What can be done to a real service from the canvas: every change goes into the plan, except the rollback. */
function ServiceInspector({
  svc,
  plan,
  bindings,
  secretNames,
  configNames,
  overlays,
  nodes,
  onPlan,
  onRolledBack,
}: {
  svc: ClusterService;
  plan: PlanItem[];
  bindings: SwarmBinding[];
  secretNames: string[];
  configNames: string[];
  overlays: Network[];
  nodes: SwarmNode[];
  onPlan: (next: PlanItem[]) => void;
  onRolledBack: () => void;
}) {
  const { t } = useTranslation();
  const isAdmin = useIsAdmin();
  const s = svc.service;
  const uses = bindings.filter((b) => b.consumer === s.name);
  const usedBy = bindings.filter((b) => b.provider === s.name);
  const handle = { id: s.id, name: s.name };
  const scaled = plan.find((p) => p.kind === "scale" && p.serviceId === s.id);
  const copies = scaled?.kind === "scale" ? scaled.to : s.desired;
  const removing = plan.some((p) => p.kind === "remove" && p.serviceId === s.id);
  const pendingUpdate = plan.find((p) => p.kind === "update" && p.serviceId === s.id);
  const [image, setImage] = useState(s.image);
  const initial = s.placement.nodeId
    ? "pin"
    : s.placement.role === "worker"
      ? "workers"
      : s.placement.role === "manager"
        ? "managers"
        : "anywhere";
  const [mode, setMode] = useState<PlacementMode>(initial);
  const [nodeId, setNodeId] = useState(s.placement.nodeId ?? nodes[0]?.id ?? "");
  const [maxPerNode, setMaxPerNode] = useState(String(s.placement.maxPerNode ?? ""));
  const [confirmRollback, setConfirmRollback] = useState(false);
  const rollback = useApiMutation(
    () => api.swarmRollbackService(s.id),
    [keys.cluster],
    () => t("swarmCanvas.rolledBackToast", { name: s.name }),
  );
  // Swarm services are not started or stopped: "stop" plans zero copies and "start" plans one.
  const replicated = isAdmin && s.mode === "replicated" && !removing;
  useCanvasShortcuts({
    remove: isAdmin && !removing ? () => onPlan(planRemove(plan, handle)) : undefined,
    stop:
      replicated && copies > 0
        ? () => onPlan(planScale(plan, { ...handle, desired: s.desired }, 0))
        : undefined,
    start:
      replicated && copies === 0
        ? () => onPlan(planScale(plan, { ...handle, desired: s.desired }, 1))
        : undefined,
  });
  const select = "rounded-lg border border-line bg-bg0 px-2 py-1.5 text-sm";
  const here = svc.networks[0] ?? null;
  const targets = overlays.filter((n) => !svc.networks.includes(n.name));
  const wantedPlacement = placementOf(mode, nodeId, maxPerNode);
  const placementChanged = JSON.stringify(wantedPlacement) !== JSON.stringify(s.placement);

  return (
    <>
      <ServiceDetails svc={svc} nodes={nodes} />
      {(uses.length > 0 || usedBy.length > 0) && (
        <>
          <h3 className="font-mono text-xs uppercase tracking-wider text-dim">
            {t("swarmCanvas.bindingsTitle")}
          </h3>
          {uses.map((b) => {
            const undoing = plan.some((p) => p.kind === "unbind" && p.bindingId === b.id);
            return (
              <div key={b.id} className="flex items-center gap-2 rounded-lg bg-bg0 p-2 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  {t("swarmCanvas.uses")} <b className="font-mono">{b.provider}</b>{" "}
                  <span className="text-dim">({b.kind})</span>
                </span>
                {isAdmin && (
                  <Button
                    onClick={() =>
                      onPlan(
                        undoing
                          ? plan.filter((p) => !(p.kind === "unbind" && p.bindingId === b.id))
                          : [
                              ...plan,
                              {
                                kind: "unbind",
                                bindingId: b.id,
                                consumer: { id: s.id, name: s.name },
                                provider: b.provider,
                                name: b.name,
                                style: b.style,
                                variables: b.variables,
                              },
                            ],
                      )
                    }
                  >
                    {undoing ? t("swarmCanvas.keepBinding") : t("swarmCanvas.unbind")}
                  </Button>
                )}
              </div>
            );
          })}
          {usedBy.map((b) => (
            <p key={b.id} className="text-sm text-dim">
              {t("swarmCanvas.usedBy")} <b className="font-mono text-fg">{b.consumer}</b>
            </p>
          ))}
        </>
      )}
      {!isAdmin ? null : removing ? (
        <Button
          onClick={() => onPlan(plan.filter((p) => !(p.kind === "remove" && p.serviceId === s.id)))}
        >
          <Undo2 size={14} /> {t("swarmCanvas.keepService")}
        </Button>
      ) : (
        <>
          <h3 className="font-mono text-xs uppercase tracking-wider text-dim">
            {t("swarmCanvas.change")}
          </h3>
          {s.mode === "replicated" && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-dim">{t("cluster.replicas")}</span>
              <Button
                aria-label={t("swarmCanvas.fewer")}
                disabled={copies <= 0}
                onClick={() =>
                  onPlan(planScale(plan, { ...handle, desired: s.desired }, copies - 1))
                }
              >
                <Minus size={14} />
              </Button>
              <span className="w-8 text-center font-mono">{copies}</span>
              <Button
                aria-label={t("swarmCanvas.more")}
                onClick={() =>
                  onPlan(planScale(plan, { ...handle, desired: s.desired }, copies + 1))
                }
              >
                <Plus size={14} />
              </Button>
              {copies !== s.desired && (
                <span className="text-xs text-accent">
                  {s.desired} → {copies}
                </span>
              )}
            </div>
          )}
          <Field label={t("common.image")}>
            <div className="flex gap-2">
              <Input value={image} onChange={(e) => setImage(e.target.value)} />
              <Button
                disabled={image.trim() === s.image && !pendingUpdate}
                onClick={() => onPlan(upsertUpdate(plan, handle, planImage(s.image, image.trim())))}
              >
                {t("swarmCanvas.set")}
              </Button>
            </div>
          </Field>
          <p className="text-xs text-dim">{t("swarmCanvas.imageHint")}</p>
          <Field label={t("swarmCanvas.moveTo")}>
            <select
              className={select}
              value=""
              onChange={(e) => {
                if (e.target.value)
                  onPlan(upsertUpdate(plan, handle, planMove(here, e.target.value)));
              }}
            >
              <option value="">{here ?? t("cluster.loose")}</option>
              {targets.map((n) => (
                <option key={n.id} value={n.name}>
                  → {n.name}
                </option>
              ))}
            </select>
          </Field>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm text-dim">{t("swarmCanvas.placement")}</legend>
            <select
              aria-label={t("swarmCanvas.placement")}
              className={select}
              value={mode}
              onChange={(e) => setMode(e.target.value as PlacementMode)}
            >
              {(["anywhere", "workers", "managers", "pin"] as const).map((m) => (
                <option key={m} value={m}>
                  {t(`swarmCanvas.mode.${m}`)}
                </option>
              ))}
            </select>
            {mode === "pin" && (
              <select
                aria-label={t("swarmCanvas.node")}
                className={select}
                value={nodeId}
                onChange={(e) => setNodeId(e.target.value)}
              >
                {nodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.hostname}
                  </option>
                ))}
              </select>
            )}
            <Input
              type="number"
              min={1}
              placeholder={t("swarmCanvas.maxPerNode")}
              aria-label={t("swarmCanvas.maxPerNode")}
              value={maxPerNode}
              onChange={(e) => setMaxPerNode(e.target.value)}
            />
            {s.mounts.length > 0 && mode !== "pin" && (
              <p className="text-xs text-amber">{t("swarmCanvas.volumesNeedPin")}</p>
            )}
            <Button
              disabled={!placementChanged && !pendingUpdate}
              onClick={() =>
                onPlan(upsertUpdate(plan, handle, planPlacement(s.placement, wantedPlacement)))
              }
            >
              {t("swarmCanvas.set")}
            </Button>
          </fieldset>
          <ServiceSettings
            // A service's settings come from the cluster: a new draft after each change.
            key={`${s.id}:${s.updatedAt}`}
            svc={svc}
            plan={plan}
            secretNames={secretNames}
            configNames={configNames}
            onPlan={onPlan}
          />
          {s.update.state !== null && (
            <>
              <p className="text-xs text-dim">
                {t("swarmCanvas.lastUpdate")}: {t(`swarmCanvas.updateState.${s.update.state}`)}
                {s.update.message ? ` · ${s.update.message}` : ""}
              </p>
              <Button onClick={() => setConfirmRollback(true)}>
                <Undo2 size={14} /> {t("swarmCanvas.rollback")}
              </Button>
            </>
          )}
          <Button variant="danger" onClick={() => onPlan(planRemove(plan, handle))}>
            <Trash2 size={14} /> {t("swarmCanvas.removeService")}
          </Button>
        </>
      )}
      <Link
        to="/swarm"
        className="mt-auto inline-flex w-fit items-center rounded-lg border border-line bg-bg1 px-3 py-1.5 text-sm font-medium hover:bg-bg2"
      >
        {t("cluster.openSwarm")} →
      </Link>
      <ConfirmDialog
        open={confirmRollback}
        title={t("swarmCanvas.rollbackTitle", { name: s.name })}
        body={t("swarmCanvas.rollbackBody")}
        command={`docker service rollback ${s.name}`}
        onConfirm={() => rollback.mutate(undefined, { onSuccess: onRolledBack })}
        onClose={() => setConfirmRollback(false)}
      />
    </>
  );
}

type StepState = "pending" | "running" | "waiting" | "done" | "undone";

const itemKey = (p: PlanItem): string =>
  p.kind === "create"
    ? `c:${p.key}`
    : p.kind === "bind"
      ? `bind:${p.key}`
      : p.kind === "unbind"
        ? `unbind:${p.bindingId}`
        : `${p.kind}:${p.serviceId}`;
const itemName = (p: PlanItem): string =>
  p.kind === "create"
    ? p.spec.name
    : p.kind === "bind" || p.kind === "unbind"
      ? p.consumer.name
      : p.name;

function PlanDialog({
  open,
  plan,
  onClose,
  onApplied,
  onChanged,
}: {
  open: boolean;
  plan: PlanItem[];
  onClose: () => void;
  onApplied: () => void;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<Record<string, StepState>>({});
  const [result, setResult] = useState<PlanResult | null>(null);

  const close = () => {
    if (busy) return;
    setResult(null);
    setSteps({});
    onClose();
  };

  const run = async () => {
    setBusy(true);
    setResult(null);
    setSteps(Object.fromEntries(plan.map((p) => [itemKey(p), "pending" as StepState])));
    const r = await applyPlan(
      plan,
      {
        create: async (spec) => (await api.swarmCreateService(spec)).id,
        update: (id, patch) => api.swarmUpdateService(id, patch),
        remove: (id) => api.swarmRemoveService(id),
        bind: async (input) => (await api.swarmCreateBinding(input)).id,
        unbind: (id) => api.swarmDeleteBinding(id),
        rollback: (id) => api.swarmRollbackService(id),
        tasks: (id) => api.swarmTasks(id),
        service: async (id) => (await api.swarmServices()).find((s) => s.id === id),
        sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      },
      {
        timeoutMs: 180_000,
        intervalMs: 1500,
        onStep: (item, phase) =>
          setSteps((cur) => ({
            ...cur,
            [itemKey(item)]:
              phase === "start" ? "running" : phase === "waiting" ? "waiting" : "done",
          })),
      },
    );
    if (!r.ok) {
      setSteps((cur) => ({
        ...cur,
        ...Object.fromEntries(r.rolledBack.map((p) => [itemKey(p), "undone" as StepState])),
      }));
    }
    setResult(r);
    setBusy(false);
    onChanged();
    if (r.ok) {
      setSteps({});
      onApplied();
      onClose();
    }
  };

  const creates = plan.filter((p): p is PlannedCreate => p.kind === "create");
  const publishes = creates.some((p) => (p.spec.ports?.length ?? 0) > 0);
  const unpinned = creates.some(
    (p) => (p.spec.mounts?.length ?? 0) > 0 && !p.spec.placement?.nodeId,
  );
  const removes = plan.filter((p) => p.kind === "remove");

  const label = (p: PlanItem): string =>
    p.kind === "create"
      ? t("swarmCanvas.stepCreate", { name: p.spec.name })
      : p.kind === "scale"
        ? t("swarmCanvas.stepScale", { name: p.name, from: p.from, to: p.to })
        : p.kind === "remove"
          ? t("swarmCanvas.stepRemove", { name: p.name })
          : p.kind === "bind"
            ? t("swarmCanvas.stepBind", { consumer: p.consumer.name, provider: p.provider.name })
            : p.kind === "unbind"
              ? t("swarmCanvas.stepUnbind", { consumer: p.consumer.name, provider: p.provider })
              : t("swarmCanvas.stepUpdate", { name: p.name });

  return (
    <Dialog open={open} onClose={close} title={t("swarmCanvas.reviewTitle")}>
      <p className="text-sm text-dim">{t("swarmCanvas.reviewHint")}</p>
      <ul className="flex flex-col gap-2">
        {plan.map((p) => (
          <li key={itemKey(p)} className="rounded-lg border border-line p-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-semibold">{label(p)}</span>
              {steps[itemKey(p)] && (
                <span className="ml-auto text-xs text-dim">
                  {t(`swarmCanvas.state.${steps[itemKey(p)]}`)}
                </span>
              )}
            </div>
            {planCommands(p).map((line) => (
              <code key={line} className="block break-words font-mono text-[11px] text-dim">
                {line}
              </code>
            ))}
          </li>
        ))}
      </ul>
      {publishes && <p className="text-xs text-amber">{t("swarmCanvas.publishedWarn")}</p>}
      {unpinned && <p className="text-xs text-amber">{t("swarmCanvas.volumesNeedPin")}</p>}
      {removes.length > 0 && (
        <p className="rounded-lg border border-danger p-2 text-xs text-danger">
          {t("swarmCanvas.removeWarn", { names: removes.map(itemName).join(", ") })}
        </p>
      )}
      <ShowCommand command={plan.flatMap(planCommands).join("\n")} />
      {result && !result.ok && result.failed && (
        <div role="alert" className="rounded-lg border border-danger p-3 text-sm">
          <p className="font-semibold text-danger">
            {t("swarmCanvas.failed", { step: itemName(result.failed.item) })}
          </p>
          <p className="mt-1 break-words text-dim">{result.failed.error}</p>
          <p className="mt-2">{t("swarmCanvas.rolledBack", { count: result.rolledBack.length })}</p>
          {result.removed.length > 0 && (
            <p className="mt-1 text-amber">
              {t("swarmCanvas.alreadyRemoved", { names: result.removed.map(itemName).join(", ") })}
            </p>
          )}
          {result.rollbackErrors.length > 0 && (
            <p className="mt-1 text-danger">
              {t("swarmCanvas.rollbackFailed", {
                steps: result.rollbackErrors
                  .map((e) => `${itemName(e.item)}: ${e.error}`)
                  .join("; "),
              })}
            </p>
          )}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button onClick={close} disabled={busy}>
          {t("common.cancel")}
        </Button>
        <Button
          write
          variant="primary"
          disabled={busy || plan.length === 0}
          onClick={() => void run()}
        >
          {busy ? t("swarmCanvas.applying") : t("swarmCanvas.apply")}
        </Button>
      </div>
    </Dialog>
  );
}
