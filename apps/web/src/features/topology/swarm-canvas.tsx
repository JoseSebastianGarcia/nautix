import type { Layout, Network, Template } from "@nautix/contracts";
import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
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
import "@xyflow/react/dist/style.css";
import { useQueryClient } from "@tanstack/react-query";
import { Minus, Plus, Undo2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { api } from "../../app/api.js";
import { keys, useCatalog, useIsAdmin, useLayout, useNetworks } from "../../app/queries.js";
import { useApiMutation } from "../../app/use-api-mutation.js";
import { useToasts } from "../../components/toast-store.js";
import { Button, Dialog, ShowCommand } from "../../components/ui.js";
import type { ClusterModel, ClusterService } from "./cluster-model.js";
import { ServiceDetails } from "./cluster-view.js";
import { EXTERNAL_ID, layoutTopology, NODE_H, NODE_W, type Placeable, zoneAt } from "./layout.js";
import { LogoBadge } from "./logo-badge.js";
import { NetworkDialog } from "./network-dialog.js";
import { type ZoneFlowNode, ZoneNode } from "./nodes.js";
import { CUSTOM_TEMPLATE_ID, DRAG_TYPE, Palette } from "./palette.js";
import {
  applyPlan,
  type PlanItem,
  type PlannedCreate,
  type PlanResult,
  planCommand,
  plannedNames,
} from "./swarm-plan.js";
import { type ServiceTarget, SwarmServiceDialog } from "./swarm-service-dialog.js";

const EMPTY_LAYOUT: Layout = { zones: {}, nodes: {} };
const NO_TEMPLATES: Template[] = [];
const NO_NETWORKS: Network[] = [];

/** Services are saved in the layout under their own prefix so they never clash with container names. */
const nodeKey = (name: string): string => `svc:${name}`;

interface ServiceNodeData extends Record<string, unknown> {
  existing: ClusterService | null;
  planned: PlannedCreate | null;
  /** Replicas the plan will leave, when it changes them. */
  scaleTo: number | null;
}
type ServiceFlowNode = Node<ServiceNodeData, "service">;

const HEALTH_TEXT = { ok: "text-ok", degraded: "text-amber", down: "text-danger" } as const;

function ServiceNode({ data, selected }: NodeProps<ServiceFlowNode>) {
  const { t } = useTranslation();
  const { existing, planned, scaleTo } = data;
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
  const changed = planned !== null || scaleTo !== null;
  return (
    <div
      style={{ width: NODE_W, height: NODE_H, boxShadow: selected ? "var(--nx-glow)" : undefined }}
      className={`flex items-center gap-3 rounded-xl border bg-bg1 px-3 ${changed ? "border-dashed border-accent" : "border-line"}`}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ opacity: 0, pointerEvents: "none" }}
      />
      <LogoBadge image={image} name={name} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold">{name}</span>
          {changed && (
            <span className="rounded bg-accent-soft px-1 text-[10px] font-semibold text-accent">
              {planned ? t("swarmCanvas.new") : t("swarmCanvas.changed")}
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
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        style={{ opacity: 0, pointerEvents: "none" }}
      />
    </div>
  );
}

const nodeTypes = { zone: ZoneNode, service: ServiceNode };
type FlowNode = ZoneFlowNode | ServiceFlowNode;

type Selection = { kind: "service"; id: string } | { kind: "planned"; key: string } | null;

interface Item extends Placeable {
  existing: ClusterService | null;
  planned: PlannedCreate | null;
}

/** Services as the layout sees them: the real ones plus the ones the plan will create. */
const toItems = (model: ClusterModel, plan: PlanItem[]): Item[] => [
  ...model.services.map((s) => ({
    id: s.service.id,
    name: nodeKey(s.service.name),
    networks: s.networks,
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
  const [target, setTarget] = useState<ServiceTarget | null>(null);
  const [newNetwork, setNewNetwork] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [nodes, setNodes] = useState<FlowNode[]>([]);

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
          },
          zIndex: 1,
          draggable: isAdmin,
          width: NODE_W,
          height: NODE_H,
        },
      ];
    });
    return [...zones, ...svc];
  }, [items, topology, isAdmin, scaleOf, t]);

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

  // A service on two overlays is drawn in the first one and linked to the other.
  const edges = useMemo<Edge[]>(
    () =>
      topology.links.map((l) => ({
        id: `l:${l.containerId}:${l.zoneId}`,
        source: `s:${l.containerId}`,
        target: `z:${l.zoneId}`,
        animated: true,
        style: { strokeDasharray: "6 4", stroke: "var(--nx-accent)" },
      })),
    [topology.links],
  );

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
      if (!item) return;
      // Moving a service to another box would change its networks: that is not drawn yet.
      persist({
        ...saved,
        nodes: { ...saved.nodes, [item.name]: { x: node.position.x, y: node.position.y } },
      });
    },
    [topology.zones, items, persist, saved],
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

  const setReplicas = (svc: ClusterService, to: number) => {
    const from = svc.service.desired;
    setPlan((cur) => {
      const rest = cur.filter((p) => !(p.kind === "scale" && p.serviceId === svc.service.id));
      return to === from
        ? rest
        : [...rest, { kind: "scale", serviceId: svc.service.id, name: svc.service.name, from, to }];
    });
  };

  const selectedService =
    selection?.kind === "service"
      ? (model.services.find((s) => s.service.id === selection.id) ?? null)
      : null;
  const selectedPlanned =
    selection?.kind === "planned"
      ? (plan.find((p): p is PlannedCreate => p.kind === "create" && p.key === selection.key) ??
        null)
      : null;

  return (
    <div className="relative flex h-full min-h-0">
      <Palette
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
            if (!node.id.startsWith("s:")) return setSelection(null);
            const id = node.id.slice(2);
            setSelection(
              id.startsWith("plan:")
                ? { kind: "planned", key: id.slice(5) }
                : { kind: "service", id },
            );
          }}
          onPaneClick={() => setSelection(null)}
          nodesConnectable={false}
          nodesDraggable={isAdmin}
          minZoom={0.2}
          proOptions={{ hideAttribution: true }}
          deleteKeyCode={null}
        >
          <Background variant={BackgroundVariant.Dots} gap={24} color="var(--nx-grid)" />
          <Controls showInteractive={false} />
        </ReactFlow>
        {model.services.length === 0 && plan.length === 0 && (
          <p className="pointer-events-none absolute inset-x-0 top-6 text-center text-sm text-dim">
            {t("swarmCanvas.empty")}
          </p>
        )}
        {plan.length > 0 && (
          <div className="nx-glass nx-lens-wide absolute bottom-4 right-[22rem] z-10 flex items-center gap-3 rounded-full py-2 pl-5 pr-2 text-sm">
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
      <aside
        aria-label={t("topology.inspector")}
        className="nx-glass nx-glass-dense nx-lens-tall absolute bottom-3 right-3 top-3 z-10 flex w-80 flex-col gap-3 overflow-y-auto rounded-3xl p-5"
      >
        <h2 className="font-mono text-xs uppercase tracking-wider text-dim">
          {t("topology.inspector")}
        </h2>
        {selectedService && (
          <>
            <ServiceDetails svc={selectedService} />
            <ReplicasEditor
              svc={selectedService}
              to={scaleOf.get(selectedService.service.id) ?? selectedService.service.desired}
              onChange={(n) => setReplicas(selectedService, n)}
            />
            <Link
              to="/swarm"
              className="mt-auto inline-flex w-fit items-center rounded-lg border border-line bg-bg1 px-3 py-1.5 text-sm font-medium hover:bg-bg2"
            >
              {t("cluster.openSwarm")} →
            </Link>
          </>
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
        {!selectedService && !selectedPlanned && (
          <p className="text-sm text-dim">{t("cluster.inspectorEmpty")}</p>
        )}
      </aside>
      <SwarmServiceDialog
        target={target}
        overlays={overlays}
        taken={[...model.services.map((s) => s.service.name), ...plannedNames(plan)]}
        onAdd={(item) => {
          setPlan((cur) => [...cur, item]);
          setSelection({ kind: "planned", key: item.key });
        }}
        onClose={() => setTarget(null)}
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
        onChanged={() => void qc.invalidateQueries({ queryKey: keys.cluster })}
      />
    </div>
  );
}

function ReplicasEditor({
  svc,
  to,
  onChange,
}: {
  svc: ClusterService;
  to: number;
  onChange: (n: number) => void;
}) {
  const { t } = useTranslation();
  const isAdmin = useIsAdmin();
  if (svc.service.mode === "global")
    return <p className="text-xs text-dim">{t("swarmCanvas.globalNoScale")}</p>;
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-dim">{t("cluster.replicas")}</span>
      <Button
        aria-label={t("swarmCanvas.fewer")}
        disabled={!isAdmin || to <= 0}
        onClick={() => onChange(to - 1)}
      >
        <Minus size={14} />
      </Button>
      <span className="w-8 text-center font-mono">{to}</span>
      <Button
        aria-label={t("swarmCanvas.more")}
        disabled={!isAdmin}
        onClick={() => onChange(to + 1)}
      >
        <Plus size={14} />
      </Button>
      {to !== svc.service.desired && (
        <span className="text-xs text-accent">
          {svc.service.desired} → {to}
        </span>
      )}
    </div>
  );
}

type StepState = "pending" | "running" | "waiting" | "done" | "undone";

const itemKey = (p: PlanItem): string => (p.kind === "create" ? `c:${p.key}` : `s:${p.serviceId}`);

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
        scale: (id, n) => api.swarmUpdateService(id, { replicas: n }),
        remove: (id) => api.swarmRemoveService(id),
        tasks: (id) => api.swarmTasks(id),
        sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      },
      {
        timeoutMs: 90_000,
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

  const droppedVolumes = plan.some((p) => p.kind === "create" && p.droppedVolumes);
  const publishes = plan.some((p) => p.kind === "create" && (p.spec.ports?.length ?? 0) > 0);

  return (
    <Dialog open={open} onClose={close} title={t("swarmCanvas.reviewTitle")}>
      <p className="text-sm text-dim">{t("swarmCanvas.reviewHint")}</p>
      <ul className="flex flex-col gap-2">
        {plan.map((p) => (
          <li key={itemKey(p)} className="rounded-lg border border-line p-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-semibold">
                {p.kind === "create"
                  ? t("swarmCanvas.stepCreate", { name: p.spec.name })
                  : t("swarmCanvas.stepScale", { name: p.name, from: p.from, to: p.to })}
              </span>
              {steps[itemKey(p)] && (
                <span className="ml-auto text-xs text-dim">
                  {t(`swarmCanvas.state.${steps[itemKey(p)]}`)}
                </span>
              )}
            </div>
            <code className="block break-words font-mono text-[11px] text-dim">
              {planCommand(p)}
            </code>
          </li>
        ))}
      </ul>
      {publishes && <p className="text-xs text-amber">{t("swarmCanvas.publishedWarn")}</p>}
      {droppedVolumes && <p className="text-xs text-amber">{t("swarmCanvas.volumesDropped")}</p>}
      <ShowCommand command={plan.map(planCommand).join("\n")} />
      {result && !result.ok && result.failed && (
        <div role="alert" className="rounded-lg border border-danger p-3 text-sm">
          <p className="font-semibold text-danger">
            {t("swarmCanvas.failed", {
              step:
                result.failed.item.kind === "create"
                  ? result.failed.item.spec.name
                  : result.failed.item.name,
            })}
          </p>
          <p className="mt-1 break-words text-dim">{result.failed.error}</p>
          <p className="mt-2">{t("swarmCanvas.rolledBack", { count: result.rolledBack.length })}</p>
          {result.rollbackErrors.length > 0 && (
            <p className="mt-1 text-danger">
              {t("swarmCanvas.rollbackFailed", {
                steps: result.rollbackErrors
                  .map((e) => `${itemKey(e.item)}: ${e.error}`)
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
