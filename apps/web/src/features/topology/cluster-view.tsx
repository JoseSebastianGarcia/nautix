import type { Network, SwarmNode } from "@nautix/contracts";
import { Lock } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useCluster, useNetworks } from "../../app/queries.js";
import {
  buildCluster,
  type ClusterModel,
  type ClusterService,
  type ClusterZone,
  networkTint,
  type Placement,
  type PlacementState,
  type ServerColumn,
} from "./cluster-model.js";
import { LogoBadge } from "./logo-badge.js";

const TEXT: Record<PlacementState, string> = {
  ok: "text-ok",
  pending: "text-amber",
  bad: "text-danger",
};
const BORDER: Record<PlacementState, string> = {
  ok: "border-line",
  pending: "border-amber",
  bad: "border-danger",
};
const MARK: Record<PlacementState, string> = { ok: "●", pending: "◌", bad: "✕" };

const nodeDot = (n: SwarmNode): string =>
  n.state !== "ready" ? "bg-danger" : n.availability === "active" ? "bg-ok" : "bg-amber";

/** Where one copy of a service runs, as a small chip: green when well, amber while waiting, red when broken. */
function Chip({ placement, focus }: { placement: Placement; focus: string | null }) {
  const { t } = useTranslation();
  const host = placement.node?.hostname ?? t("cluster.unknownNode");
  const dim = focus !== null && placement.task.nodeId !== focus;
  return (
    <span
      title={placement.task.error || `${host} · ${placement.task.state}`}
      className={`inline-flex items-center gap-1 rounded-md border bg-bg2 px-1.5 py-0.5 font-mono text-[10px] ${BORDER[placement.state]} ${dim ? "opacity-40" : ""} ${placement.task.nodeId === focus ? "ring-1 ring-accent" : ""}`}
    >
      <span className={TEXT[placement.state]}>{MARK[placement.state]}</span> {host}
    </span>
  );
}

const replicasText = (s: ClusterService, t: (k: string) => string): string =>
  s.service.mode === "global"
    ? t("cluster.global")
    : `${s.placements.filter((p) => p.state === "ok").length}/${s.service.desired}`;

const HEALTH_TEXT = { ok: "text-ok", degraded: "text-amber", down: "text-danger" } as const;

function ServiceCard({
  svc,
  selected,
  focus,
  onSelect,
}: {
  svc: ClusterService;
  selected: boolean;
  focus: string | null;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      style={{ boxShadow: selected ? "var(--nx-glow)" : undefined }}
      className="relative flex w-64 flex-col gap-2 rounded-xl border border-line bg-bg1 p-3 text-left before:absolute before:-left-5 before:top-1/2 before:h-0.5 before:w-5 before:bg-[var(--bus)]"
    >
      <span className="flex items-center gap-3">
        <LogoBadge image={svc.service.image} name={svc.service.name} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold">{svc.service.name}</span>
            <span className={`ml-auto font-mono text-xs font-bold ${HEALTH_TEXT[svc.health]}`}>
              {replicasText(svc, t)}
            </span>
          </span>
          <span className="block truncate font-mono text-[11px] text-dim">{svc.service.image}</span>
        </span>
      </span>
      <span className="flex flex-wrap gap-1">
        {svc.placements.map((p) => (
          <Chip key={p.task.id} placement={p} focus={focus} />
        ))}
        {svc.missing > 0 && (
          <span className="rounded-md border border-amber px-1.5 py-0.5 font-mono text-[10px] text-amber">
            ◌ {t("cluster.looking", { count: svc.missing })}
          </span>
        )}
      </span>
      {svc.service.ports.some((p) => p.published) && (
        <span className="text-[11px] text-amber">
          {t("cluster.publishedAll", {
            ports: svc.service.ports
              .filter((p) => p.published)
              .map((p) => p.published)
              .join(", "),
          })}
        </span>
      )}
    </button>
  );
}

/** A network over several servers: a double line, and a bus that every service hangs from. */
function OverlayZone({
  zone,
  selected,
  focus,
  onSelect,
}: {
  zone: ClusterZone;
  selected: string | null;
  focus: string | null;
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation();
  const n: Network = zone.network;
  const tint = networkTint(n.name);
  return (
    <section
      aria-label={n.name}
      style={{
        ["--bus" as string]: tint,
        borderColor: "var(--nx-zone-line)",
        background: "var(--nx-zone)",
      }}
      className="rounded-2xl border-4 border-double p-4"
    >
      <h3 className="mb-3 flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-accent">
        {t("topology.overlayZone")} · {n.name}
        <span className="ml-auto flex items-center gap-1 normal-case text-dim">
          {n.encrypted ? <Lock size={12} /> : null}
          {n.encrypted ? t("topology.overlayEncryptedShort") : t("topology.overlayShort")}
          {n.subnet ? ` · ${n.subnet}` : ""}
        </span>
      </h3>
      <div
        className="relative ml-5 flex flex-col gap-3 border-l-4 pl-5"
        style={{ borderColor: tint }}
      >
        {zone.services.map((s) => (
          <ServiceCard
            key={s.service.id}
            svc={s}
            selected={selected === s.service.id}
            focus={focus}
            onSelect={() => onSelect(s.service.id)}
          />
        ))}
      </div>
    </section>
  );
}

function ServerBox({
  col,
  selected,
  focus,
  onSelect,
}: {
  col: ServerColumn;
  selected: string | null;
  focus: string | null;
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation();
  const down = col.node.state !== "ready";
  return (
    <section
      aria-label={col.node.hostname}
      className={`flex w-64 shrink-0 flex-col rounded-2xl border bg-bg1 ${down ? "border-danger" : "border-line"}`}
    >
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        <span className={`h-2 w-2 rounded-full ${nodeDot(col.node)}`} aria-hidden="true" />
        <b className="text-sm">{col.node.hostname}</b>
        {col.node.role === "manager" && (
          <span className="rounded bg-accent-soft px-1 text-[10px] font-semibold text-accent">
            ♛ {t("cluster.manager")}
          </span>
        )}
        <span className="ml-auto font-mono text-[11px] text-dim">{col.node.address}</span>
      </header>
      <div className="flex flex-col gap-2 p-3">
        {down && <p className="text-xs text-danger">{t("cluster.nodeDown")}</p>}
        {col.placements.length === 0 && !down && (
          <p className="text-xs text-dim">{t("cluster.noTasks")}</p>
        )}
        {col.placements.map((p) => (
          <button
            key={p.task.id}
            type="button"
            onClick={() => onSelect(p.service.service.id)}
            aria-pressed={selected === p.service.service.id}
            style={{ boxShadow: selected === p.service.service.id ? "var(--nx-glow)" : undefined }}
            className={`flex flex-col gap-1 rounded-xl border bg-bg0 p-2 text-left ${BORDER[p.state]} ${focus && focus !== col.node.id ? "opacity-40" : ""}`}
          >
            <span className="flex items-center gap-2">
              <span className={`text-xs ${TEXT[p.state]}`}>{MARK[p.state]}</span>
              <span className="truncate text-sm font-semibold">{p.service.service.name}</span>
              <span className="ml-auto font-mono text-[10px] text-dim">#{p.task.slot ?? "·"}</span>
            </span>
            <span className="flex flex-wrap gap-1">
              {p.service.networks.map((name) => (
                <span
                  key={name}
                  className="rounded border px-1 font-mono text-[10px]"
                  style={{ borderColor: networkTint(name), color: networkTint(name) }}
                >
                  {name}
                </span>
              ))}
            </span>
            {p.task.error && <span className="text-[11px] text-danger">{p.task.error}</span>}
          </button>
        ))}
      </div>
    </section>
  );
}

function NodesPanel({
  model,
  managers,
  focus,
  onFocus,
}: {
  model: ClusterModel;
  managers: number;
  focus: string | null;
  onFocus: (id: string | null) => void;
}) {
  const { t } = useTranslation();
  return (
    <aside className="flex w-64 shrink-0 flex-col gap-3 overflow-y-auto border-r border-line bg-bg1 p-4">
      <h2 className="font-mono text-xs uppercase tracking-wider text-dim">{t("cluster.nodes")}</h2>
      <p className="text-xs text-dim">
        {t("cluster.nodesSummary", { nodes: model.servers.length, managers })}
      </p>
      {managers < 3 && (
        <p className="text-xs text-amber">{t("cluster.haWarning", { count: managers })}</p>
      )}
      {model.servers.map((col) => (
        <button
          key={col.node.id}
          type="button"
          aria-pressed={focus === col.node.id}
          onClick={() => onFocus(focus === col.node.id ? null : col.node.id)}
          className={`rounded-xl border bg-bg0 p-3 text-left ${col.node.state !== "ready" ? "border-danger" : focus === col.node.id ? "border-accent" : "border-line"}`}
        >
          <span className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${nodeDot(col.node)}`} aria-hidden="true" />
            <b className="min-w-0 truncate text-sm">{col.node.hostname}</b>
            {col.node.role === "manager" && (
              <span className="shrink-0 whitespace-nowrap rounded bg-accent-soft px-1 text-[10px] font-semibold text-accent">
                ♛ {t("cluster.manager")}
              </span>
            )}
          </span>
          <span className="mt-1 block font-mono text-[11px] text-dim">
            {col.node.address} · {t(`cluster.availability.${col.node.availability}`)}
            {col.node.leader ? ` · ${t("cluster.leader")}` : ""}
          </span>
          <span className="mt-1 block text-[11px] text-dim">
            {t("cluster.tasksCount", { count: col.placements.length })}
          </span>
          {col.node.state !== "ready" && (
            <span className="mt-1 block text-[11px] text-danger">{t("cluster.nodeDown")}</span>
          )}
        </button>
      ))}
      <p className="mt-auto text-xs text-dim">{t("cluster.focusHint")}</p>
    </aside>
  );
}

function ServiceInspector({ svc }: { svc: ClusterService | null }) {
  const { t } = useTranslation();
  return (
    <aside className="flex w-80 shrink-0 flex-col gap-3 overflow-y-auto border-l border-line bg-bg1 p-4">
      <h2 className="font-mono text-xs uppercase tracking-wider text-dim">
        {t("topology.inspector")}
      </h2>
      {!svc ? (
        <p className="text-sm text-dim">{t("cluster.inspectorEmpty")}</p>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <LogoBadge image={svc.service.image} name={svc.service.name} />
            <div className="min-w-0">
              <div className="truncate text-base font-semibold">{svc.service.name}</div>
              <div className="truncate font-mono text-xs text-dim">{svc.service.image}</div>
            </div>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-dim">{t("cluster.mode")}</dt>
            <dd>{t(`cluster.modes.${svc.service.mode}`)}</dd>
            <dt className="text-dim">{t("cluster.replicas")}</dt>
            <dd className={HEALTH_TEXT[svc.health]}>
              {svc.placements.filter((p) => p.state === "ok").length} / {svc.service.desired}
            </dd>
            <dt className="text-dim">{t("cluster.networks")}</dt>
            <dd>{svc.networks.length > 0 ? svc.networks.join(", ") : "—"}</dd>
            {svc.service.stack && (
              <>
                <dt className="text-dim">{t("cluster.stack")}</dt>
                <dd>{svc.service.stack}</dd>
              </>
            )}
          </dl>
          <h3 className="font-mono text-xs uppercase tracking-wider text-dim">
            {t("cluster.tasks")}
          </h3>
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-dim">
                <th className="py-1 font-medium">#</th>
                <th className="py-1 font-medium">{t("cluster.node")}</th>
                <th className="py-1 font-medium">{t("cluster.state")}</th>
              </tr>
            </thead>
            <tbody>
              {svc.placements.map((p) => (
                <tr key={p.task.id} className="border-t border-line align-top">
                  <td className="py-1.5">{p.task.slot ?? "·"}</td>
                  <td className="whitespace-nowrap py-1.5 font-mono">
                    {p.node?.hostname ?? t("cluster.unknownNode")}
                  </td>
                  <td className={`py-1.5 ${TEXT[p.state]}`}>
                    {MARK[p.state]} {p.task.state}
                    {p.task.error && <div className="text-dim">{p.task.error}</div>}
                  </td>
                </tr>
              ))}
              {svc.missing > 0 && (
                <tr className="border-t border-line text-amber">
                  <td className="py-1.5" colSpan={3}>
                    ◌ {t("cluster.looking", { count: svc.missing })}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="text-xs text-dim">{t("cluster.whereHint")}</p>
          <Link
            to="/swarm"
            className="mt-auto inline-flex w-fit items-center rounded-lg border border-line bg-bg1 px-3 py-1.5 text-sm font-medium hover:bg-bg2"
          >
            {t("cluster.openSwarm")} →
          </Link>
        </>
      )}
    </aside>
  );
}

const VIEW_KEY = "nautix.cluster.by";
const readBy = (): "network" | "server" => {
  try {
    return localStorage.getItem(VIEW_KEY) === "server" ? "server" : "network";
  } catch {
    return "network";
  }
};

/** The cluster as the manager sees it, read-only: by network (what talks to what) or by server (what runs where). */
export function ClusterView() {
  const { t } = useTranslation();
  const cluster = useCluster(true);
  const { data: networks = [] } = useNetworks();
  const [by, setByState] = useState<"network" | "server">(readBy);
  const [selected, setSelected] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const data = cluster.data;
  const model = useMemo(() => (data ? buildCluster(data, networks) : null), [data, networks]);

  const setBy = (next: "network" | "server") => {
    setByState(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      /* the choice just is not remembered */
    }
  };

  if (!data || !model)
    return (
      <p className="p-6 text-dim">{cluster.isError ? t("errors.generic") : t("common.loading")}</p>
    );

  if (!data.status.isManager || data.status.locked)
    return (
      <div className="p-6">
        <p className="max-w-xl rounded-xl border border-amber bg-bg1 p-4 text-sm text-amber">
          {data.status.locked ? t("cluster.locked") : t("cluster.notManager")}{" "}
          <Link to="/swarm" className="underline">
            {t("topology.goToSwarm")}
          </Link>
        </p>
      </div>
    );

  const svc = model.services.find((s) => s.service.id === selected) ?? null;
  const legend = [...new Set(model.zones.map((z) => z.network.name))];

  return (
    <div className="flex h-full min-h-0">
      <NodesPanel model={model} managers={data.status.managers} focus={focus} onFocus={setFocus} />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-3 border-b border-line bg-bg1 px-4 py-2">
          <div className="flex rounded-lg border border-line p-0.5 text-sm" role="tablist">
            {(["network", "server"] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={by === v}
                onClick={() => setBy(v)}
                className={`rounded-md px-3 py-1 ${by === v ? "bg-accent-soft text-accent" : "text-dim hover:text-fg"}`}
              >
                {t(`cluster.by.${v}`)}
              </button>
            ))}
          </div>
          {by === "server" && legend.length > 0 && (
            <span className="flex items-center gap-3 text-xs text-dim">
              {legend.map((name) => (
                <span key={name} className="flex items-center gap-1 font-mono">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: networkTint(name) }}
                  />
                  {name}
                </span>
              ))}
            </span>
          )}
          <span className="ml-auto text-xs text-dim">{t("cluster.readOnly")}</span>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-6">
          {model.services.length === 0 ? (
            <p className="text-sm text-dim">
              {t("cluster.noServices")}{" "}
              <Link to="/swarm" className="text-accent underline">
                {t("cluster.openSwarm")}
              </Link>
            </p>
          ) : by === "network" ? (
            <div className="flex flex-col gap-5">
              {model.zones.map((z) => (
                <OverlayZone
                  key={z.network.id}
                  zone={z}
                  selected={selected}
                  focus={focus}
                  onSelect={setSelected}
                />
              ))}
              {model.loose.length > 0 && (
                <section
                  aria-label={t("cluster.loose")}
                  className="rounded-2xl border-2 border-dashed border-line p-4"
                >
                  <h3 className="mb-3 font-mono text-xs uppercase tracking-wider text-dim">
                    {t("cluster.loose")}
                  </h3>
                  <div
                    className="ml-5 flex flex-col gap-3"
                    style={{ ["--bus" as string]: "var(--nx-line)" }}
                  >
                    {model.loose.map((s) => (
                      <ServiceCard
                        key={s.service.id}
                        svc={s}
                        selected={selected === s.service.id}
                        focus={focus}
                        onSelect={() => setSelected(s.service.id)}
                      />
                    ))}
                  </div>
                </section>
              )}
            </div>
          ) : (
            <div className="flex items-start gap-4">
              {model.servers.map((col) => (
                <ServerBox
                  key={col.node.id}
                  col={col}
                  selected={selected}
                  focus={focus}
                  onSelect={setSelected}
                />
              ))}
            </div>
          )}
        </div>
      </div>
      <ServiceInspector svc={svc} />
    </div>
  );
}
