import type { Container, Network } from "@nautix/contracts";
import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import { Globe, Lock, ShieldAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NODE_H, NODE_W } from "./layout.js";
import { LogoBadge } from "./logo-badge.js";

export type ContainerNodeData = { container: Container } & Record<string, unknown>;
export type ZoneNodeData = {
  network: Network | null;
  count: number;
  w: number;
  h: number;
} & Record<string, unknown>;

export type ContainerFlowNode = Node<ContainerNodeData, "container">;
export type ZoneFlowNode = Node<ZoneNodeData, "zone">;

// Handles only anchor edges (extra networks, depends_on); they are not interactive, so they stay invisible.
const HIDDEN_HANDLE = { opacity: 0, pointerEvents: "none" as const };

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
  const published = c.ports.filter((p) => p.publicPort !== undefined);
  return (
    <div
      style={{ width: NODE_W, height: NODE_H, boxShadow: selected ? "var(--nx-glow)" : undefined }}
      className="flex items-center gap-3 rounded-xl border border-line bg-bg1 px-3"
    >
      <Handle type="target" position={Position.Left} isConnectable={false} style={HIDDEN_HANDLE} />
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
      <Handle type="source" position={Position.Right} isConnectable={false} style={HIDDEN_HANDLE} />
    </div>
  );
}

export function ZoneNode({ data, selected }: NodeProps<ZoneFlowNode>) {
  const { t } = useTranslation();
  const n = data.network;
  const external = n === null;
  return (
    <div
      style={{
        width: data.w,
        height: data.h,
        background: external ? "transparent" : "var(--nx-zone)",
        borderColor: external ? "var(--nx-ext-line)" : "var(--nx-zone-line)",
        boxShadow: selected ? "var(--nx-glow)" : undefined,
      }}
      className="rounded-2xl border-2 border-dashed"
    >
      <div className="flex items-center justify-between px-4 pt-3 text-xs">
        <span
          className="truncate font-mono uppercase tracking-wider"
          style={{ color: external ? "var(--nx-cyan)" : "var(--nx-accent)" }}
        >
          {external ? t("topology.external") : `${t("topology.networkZone")} · ${n.name}`}
        </span>
        <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-dim">
          {external ? (
            <>
              <Lock size={12} /> {t("topology.loopbackOnly")}
            </>
          ) : (
            <>
              {n.internal ? <Lock size={12} /> : <Globe size={12} />}
              {n.internal ? t("topology.isolated") : t("topology.bridged")}
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
      <Handle type="target" position={Position.Top} isConnectable={false} style={{ opacity: 0 }} />
    </div>
  );
}
