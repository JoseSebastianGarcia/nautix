import type { Container, Network } from "@nautix/contracts";
import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import { Globe, Lock, ShieldAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NODE_H, NODE_W } from "./layout.js";
import { LogoBadge } from "./logo-badge.js";

export type ContainerNodeData = { container: Container; canBind?: boolean } & Record<
  string,
  unknown
>;
export type ZoneNodeData = {
  network: Network | null;
  count: number;
  w: number;
  h: number;
  canTunnel?: boolean;
  /** Actions needed to bring the zone back to its applied document (0 or missing = in sync). */
  drift?: number;
} & Record<string, unknown>;

export type ContainerFlowNode = Node<ContainerNodeData, "container">;
export type ZoneFlowNode = Node<ZoneNodeData, "zone">;

// Handles only anchor edges (extra networks, depends_on); they are not interactive, so they stay invisible.
const HIDDEN_HANDLE = { opacity: 0, pointerEvents: "none" as const };

/** A small dot on the node's edge: drag from an app's dot to a service's dot to bind them. */
const BIND_HANDLE = {
  width: 12,
  height: 12,
  background: "var(--nx-accent)",
  border: "2px solid var(--nx-bg-1)",
} as const;

const STATE_COLOR: Record<string, string> = {
  running: "bg-ok",
  paused: "bg-amber",
  restarting: "bg-amber",
  created: "bg-dim",
  exited: "bg-dim",
  removing: "bg-danger",
  dead: "bg-danger",
};

export const isPubliclyBound = (c: Container): boolean =>
  c.ports.some(
    (p) =>
      p.publicPort !== undefined && (p.ip === "0.0.0.0" || p.ip === "::" || p.ip === undefined),
  );

export function ContainerNode({ data, selected }: NodeProps<ContainerFlowNode>) {
  const { t } = useTranslation();
  const c = data.container;
  const exposed = isPubliclyBound(c);
  // Nautix itself is locked, and viewers cannot change anything.
  const bindable = data.canBind === true && !c.isSelf;
  const published = c.ports.filter((p) => p.publicPort !== undefined);
  return (
    <div
      style={{ width: NODE_W, height: NODE_H, boxShadow: selected ? "var(--nx-glow)" : undefined }}
      className="flex items-center gap-3 rounded-xl border border-line bg-bg1 px-3"
    >
      <Handle
        id="bind"
        type="target"
        position={Position.Left}
        isConnectable={bindable}
        style={bindable ? BIND_HANDLE : HIDDEN_HANDLE}
        aria-label={t("bindings.dragHint")}
      />
      <LogoBadge image={c.image} name={c.name} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            role="img"
            aria-label={t(`containers.state.${c.state}`)}
            title={t(`containers.state.${c.state}`)}
            className={`h-2 w-2 shrink-0 rounded-full ${STATE_COLOR[c.state] ?? "bg-dim"}`}
          />
          <span className="truncate text-sm font-semibold">{c.name}</span>
          {c.isSelf && (
            <span className="rounded bg-accent-soft px-1 text-[10px] font-semibold text-accent">
              {t("self.badge")}
            </span>
          )}
        </div>
        <div className="truncate font-mono text-[11px] text-dim">{c.image}</div>
        <div className="mt-0.5 flex items-center gap-1 text-[10px]">
          {published.length === 0 ? (
            <span className="text-dim">{t(`containers.state.${c.state}`)}</span>
          ) : exposed ? (
            <span className="inline-flex items-center gap-1 text-amber">
              <ShieldAlert size={11} /> {t("topology.publicPort")}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-cyan">
              <Lock size={11} /> {t("topology.protectedPort")} ·{" "}
              {published.map((p) => p.publicPort).join(",")}
            </span>
          )}
        </div>
      </div>
      <Handle
        id="bind"
        type="source"
        position={Position.Right}
        isConnectable={bindable}
        style={bindable ? BIND_HANDLE : HIDDEN_HANDLE}
        aria-label={t("bindings.dragHint")}
      />
    </div>
  );
}

export function ZoneNode({ data, selected }: NodeProps<ZoneFlowNode>) {
  const { t } = useTranslation();
  const n = data.network;
  const external = n === null;
  const overlay = n?.driver === "overlay";
  return (
    <div
      style={{
        width: data.w,
        height: data.h,
        background: external ? "transparent" : "var(--nx-zone)",
        borderColor: external ? "var(--nx-ext-line)" : "var(--nx-zone-line)",
        boxShadow: selected ? "var(--nx-glow)" : undefined,
      }}
      // A double line tells an overlay (one network over several servers) from a local one at a glance.
      className={`rounded-2xl border-2 ${overlay ? "border-double" : "border-dashed"}`}
    >
      <div className="flex items-center justify-between px-4 pt-3 text-xs">
        <span
          className="truncate font-mono uppercase tracking-wider"
          style={{ color: external ? "var(--nx-cyan)" : "var(--nx-accent)" }}
        >
          {external
            ? t("topology.external")
            : `${overlay ? t("topology.overlayZone") : t("topology.networkZone")} · ${n.name}`}
          {(data.drift ?? 0) > 0 && (
            <span
              className="ml-2 rounded bg-amber/20 px-1.5 py-0.5 text-[10px] normal-case text-amber"
              title={t("zones.driftHint")}
            >
              {t("zones.drift", { count: data.drift })}
            </span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-dim">
          {external ? (
            <>
              <Lock size={12} /> {t("topology.loopbackOnly")}
            </>
          ) : (
            <>
              {n.internal || n.encrypted ? <Lock size={12} /> : <Globe size={12} />}
              {n.internal
                ? t("topology.isolated")
                : overlay
                  ? t(n.encrypted ? "topology.overlayEncryptedShort" : "topology.overlayShort")
                  : t("topology.bridged")}
              {n.subnet ? ` · ${n.subnet}` : ""}
            </>
          )}
        </span>
      </div>
      {data.count === 0 && (
        <div className="px-4 pt-6 text-center text-xs text-dim">
          {external ? t("topology.externalHint") : t("topology.sharesNetwork")}
        </div>
      )}
      {n && (
        // Drag from this dot to another box's dot to open a tunnel between the two networks.
        <Handle
          id="tunnel"
          type="source"
          position={Position.Right}
          isConnectable={data.canTunnel === true}
          title={t("tunnel.handle")}
          aria-label={t("tunnel.handle")}
          style={{
            width: 14,
            height: 14,
            background: "var(--nx-bg-1)",
            border: "2px solid var(--nx-accent)",
            right: -8,
          }}
        />
      )}
    </div>
  );
}
