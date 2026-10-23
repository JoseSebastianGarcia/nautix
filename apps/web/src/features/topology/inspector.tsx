import {
  type Binding,
  type Container,
  type ContainerAction,
  exposureOf,
  type Network,
  type TunnelInfo,
  tunnelFromContainer,
} from "@nautix/contracts";
import { useQuery } from "@tanstack/react-query";
import {
  FileDown,
  Lock,
  Play,
  RotateCw,
  ShieldAlert,
  Square,
  SquareTerminal,
  Trash2,
  Unplug,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { api } from "../../app/api.js";
import { cli } from "../../app/cli.js";
import { keys, useIsAdmin } from "../../app/queries.js";
import { useApiMutation } from "../../app/use-api-mutation.js";
import { Button, ConfirmDialog, ShowCommand } from "../../components/ui.js";
import { BindingsSection } from "../bindings/bindings-section.js";
import { EnvDialog } from "../containers/env-dialog.js";
import { ExposureDialog, type ExposureTarget } from "../containers/exposure-dialog.js";
import type { ExportTarget } from "./export-dialog.js";
import { LogoBadge } from "./logo-badge.js";
import { ShortcutHints } from "./shortcut-hints.js";
import { useCanvasShortcuts } from "./use-canvas-shortcuts.js";

export type Selection =
  | { kind: "container"; id: string }
  | { kind: "zone"; id: string }
  | { kind: "tunnel"; id: string }
  | null;

export function Inspector({
  open,
  selection,
  containers,
  networks,
  bindings,
  onClearSelection,
  onExport,
}: {
  open: boolean;
  selection: Selection;
  containers: Container[];
  networks: Network[];
  bindings: Binding[];
  onClearSelection: () => void;
  onExport: (target: ExportTarget) => void;
}) {
  const { t } = useTranslation();
  const container =
    selection?.kind === "container" ? containers.find((c) => c.id === selection.id) : undefined;
  const tunnelContainer =
    selection?.kind === "tunnel" ? containers.find((c) => c.id === selection.id) : undefined;
  const tunnel = tunnelContainer ? tunnelFromContainer(tunnelContainer) : null;
  const network =
    selection?.kind === "zone" ? networks.find((n) => n.id === selection.id) : undefined;

  if (!open) return null;
  return (
    <aside
      className="nx-glass nx-glass-dense nx-hairline nx-lens-tall absolute bottom-3 right-3 top-3 z-10 flex w-80 flex-col gap-4 overflow-y-auto rounded-3xl p-5"
      aria-label={t("topology.inspector")}
    >
      <h2 className="font-mono text-xs uppercase tracking-wider text-dim">
        {t("topology.inspector")}
      </h2>
      {tunnel && <TunnelInspector tunnel={tunnel} onGone={onClearSelection} />}
      {container && (
        <ContainerInspector
          container={container}
          networks={networks}
          bindings={bindings}
          onGone={onClearSelection}
        />
      )}
      {network && (
        <NetworkInspector
          network={network}
          containers={containers}
          onGone={onClearSelection}
          onExport={onExport}
        />
      )}
      {!container && !network && !tunnel && (
        <p className="text-sm text-dim">{t("topology.inspectorEmpty")}</p>
      )}
      <ShortcutHints />
    </aside>
  );
}

function ContainerInspector({
  container: c,
  networks,
  bindings,
  onGone,
}: {
  container: Container;
  networks: Network[];
  bindings: Binding[];
  onGone: () => void;
}) {
  const { t } = useTranslation();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [exposing, setExposing] = useState<ExposureTarget | null>(null);
  const [editingEnv, setEditingEnv] = useState(false);
  const refresh = [keys.containers, keys.networks];

  const isAdmin = useIsAdmin();
  // The container running Nautix is locked by the server; the UI just doesn't offer the actions.
  const locked = c.isSelf === true;
  const act = useApiMutation((a: ContainerAction) => api.containerAction(c.id, a), refresh);
  const remove = useApiMutation(() => api.removeContainer(c.id, true), refresh);
  const leave = useApiMutation((networkId: string) => api.disconnect(networkId, c.id), refresh);
  const join = useApiMutation((networkId: string) => api.connect(networkId, c.id), refresh);
  const joinable = networks.filter((n) => !n.system && !c.networks.includes(n.name));
  const logs = useQuery({
    queryKey: ["logs", c.id],
    queryFn: () => api.logs(c.id),
    enabled: showLogs,
    refetchInterval: showLogs ? 3000 : false,
  });

  const running = c.state === "running";
  useCanvasShortcuts({
    remove: isAdmin && !locked ? () => setConfirmRemove(true) : undefined,
    start: isAdmin && !locked && !running && !act.isPending ? () => act.mutate("start") : undefined,
    stop: isAdmin && !locked && running && !act.isPending ? () => act.mutate("stop") : undefined,
  });
  const published = c.ports.filter((p) => p.publicPort !== undefined);
  const memberOf = networks.filter((n) => c.networks.includes(n.name));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <LogoBadge image={c.image} name={c.name} />
        <div className="min-w-0">
          <Link
            className="block truncate font-semibold hover:text-accent hover:underline"
            to={`/containers/${c.id}`}
            title={t("details.details")}
          >
            {c.name}
          </Link>
          <div className="truncate font-mono text-xs text-dim">{c.image}</div>
        </div>
      </div>
      <div className="text-sm">
        <span className="text-dim">{t("common.status")}: </span>
        {t(`containers.state.${c.state}`)} · <span className="text-dim">{c.status}</span>
      </div>

      {locked && (
        <p className="flex items-start gap-2 rounded-lg border border-line bg-bg2 p-2 text-xs text-amber">
          <Lock size={14} className="mt-0.5 shrink-0" /> {t("self.lockedNote")}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {running ? (
          <>
            <Button write onClick={() => act.mutate("stop")} disabled={act.isPending || locked}>
              <Square size={14} /> {t("containers.stop")}
            </Button>
            <Button write onClick={() => act.mutate("restart")} disabled={act.isPending || locked}>
              <RotateCw size={14} /> {t("containers.restart")}
            </Button>
            {isAdmin && !locked && (
              <Link
                to={`/terminal/${c.id}`}
                className="inline-flex items-center gap-2 rounded-lg border border-line bg-bg1 px-3 py-1.5 text-sm font-medium hover:bg-bg2"
              >
                <SquareTerminal size={14} /> {t("terminal.open_btn")}
              </Link>
            )}
          </>
        ) : (
          <Button
            write
            variant="primary"
            onClick={() => act.mutate("start")}
            disabled={act.isPending}
          >
            <Play size={14} /> {t("containers.start")}
          </Button>
        )}
        <Button write variant="danger" disabled={locked} onClick={() => setConfirmRemove(true)}>
          <Trash2 size={14} /> {t("containers.remove")}
        </Button>
      </div>
      <ShowCommand
        command={[
          cli.containerAction(running ? "stop" : "start", c.name),
          cli.removeContainer(c.name, true),
        ].join("\n")}
      />

      <section>
        <h3 className="mb-2 text-xs uppercase tracking-wider text-dim">{t("common.networks")}</h3>
        <ul className="flex flex-col gap-1">
          {memberOf.length === 0 && <li className="text-sm text-dim">{t("common.none")}</li>}
          {memberOf.map((n) => (
            <li
              key={n.id}
              className="flex items-center justify-between rounded-lg bg-bg2 px-2 py-1 text-sm"
            >
              <span className="font-mono">{n.name}</span>
              {!n.system && !locked && (
                <button
                  type="button"
                  title={t("topology.disconnect")}
                  aria-label={`${t("topology.disconnect")} ${n.name}`}
                  className="text-dim hover:text-danger"
                  onClick={() => leave.mutate(n.id)}
                >
                  <Unplug size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
        {joinable.length > 0 && !locked && (
          <select
            aria-label={t("topology.joinNetwork")}
            className="mt-2 w-full rounded-lg border border-line bg-bg0 px-2 py-1.5 text-sm text-fg"
            value=""
            onChange={(e) => e.target.value && join.mutate(e.target.value)}
          >
            <option value="">{t("topology.joinNetwork")}</option>
            {joinable.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </select>
        )}
        <p className="mt-1 text-xs text-dim">{t("topology.joinHint")}</p>
      </section>

      <section>
        <h3 className="mb-2 text-xs uppercase tracking-wider text-dim">{t("common.ports")}</h3>
        {published.length === 0 && <p className="text-sm text-dim">{t("common.none")}</p>}
        <ul className="flex flex-col gap-1">
          {published.map((p) => {
            const kind = exposureOf(p.ip).kind;
            return (
              <li
                key={`${p.ip}:${p.publicPort}:${p.privatePort}`}
                className="flex items-center justify-between gap-2 rounded-lg bg-bg2 px-2 py-1 font-mono text-xs"
              >
                <span className="min-w-0 truncate">
                  {p.ip ?? "0.0.0.0"}:{p.publicPort} → {p.privatePort}/{p.type}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {kind === "open" ? (
                    <ShieldAlert
                      size={14}
                      className="text-amber"
                      aria-label={t("topology.publicPort")}
                    />
                  ) : (
                    <Lock
                      size={14}
                      className={kind === "local" ? "text-cyan" : "text-accent"}
                      aria-label={t("topology.protectedPort")}
                    />
                  )}
                  {!locked && (
                    <button
                      type="button"
                      className="text-accent hover:underline"
                      onClick={() =>
                        setExposing({
                          containerId: c.id,
                          container: c.name,
                          containerPort: p.privatePort,
                          hostPort: p.publicPort ?? 0,
                          protocol: p.type,
                          hostIp: p.ip ?? "",
                        })
                      }
                    >
                      {t("exposure.change")}
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
        <ExposureDialog target={exposing} onClose={() => setExposing(null)} />
      </section>

      <BindingsSection container={c} bindings={bindings} />

      {!locked && (
        <section>
          <Button write onClick={() => setEditingEnv(true)}>
            {t("env.edit")}
          </Button>
          <EnvDialog container={editingEnv ? c : null} onClose={() => setEditingEnv(false)} />
        </section>
      )}

      <section>
        <Button onClick={() => setShowLogs((v) => !v)}>{t("topology.logs")}</Button>
        {showLogs && (
          <>
            <pre className="mt-2 max-h-64 overflow-auto rounded-lg border border-line bg-bg0 p-2 font-mono text-[11px] leading-snug whitespace-pre-wrap">
              {logs.data?.logs || t("common.empty")}
            </pre>
            <div className="mt-2">
              <ShowCommand command={cli.logs(c.name)} />
            </div>
          </>
        )}
      </section>

      <ConfirmDialog
        open={confirmRemove}
        title={t("topology.removeContainerTitle", { name: c.name })}
        confirmLabel={t("common.delete")}
        body={t("topology.removeContainerBody", { image: c.image })}
        command={cli.removeContainer(c.name, true)}
        onConfirm={() => remove.mutate(undefined, { onSuccess: onGone })}
        onClose={() => setConfirmRemove(false)}
      />
    </div>
  );
}

function NetworkInspector({
  network: n,
  containers,
  onGone,
  onExport,
}: {
  network: Network;
  containers: Container[];
  onGone: () => void;
  onExport: (target: ExportTarget) => void;
}) {
  const { t } = useTranslation();
  const [confirm, setConfirm] = useState(false);
  const remove = useApiMutation(() => api.removeNetwork(n.id), [keys.networks]);
  const members = containers.filter((c) => c.networks.includes(n.name));
  const isAdmin = useIsAdmin();
  useCanvasShortcuts({
    remove: isAdmin && !n.system && members.length === 0 ? () => setConfirm(true) : undefined,
  });
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="font-semibold">{n.name}</div>
        <div className="font-mono text-xs text-dim">
          {n.driver} · {n.subnet ?? "—"} ·{" "}
          {n.internal ? t("topology.isolated") : t("topology.bridged")}
        </div>
      </div>
      <p className="text-sm text-dim">
        {n.internal ? t("topology.internalHint") : t("topology.sharesNetwork")}
      </p>
      <ul className="flex flex-col gap-1">
        {members.map((c) => (
          <li key={c.id} className="flex items-center gap-2 rounded-lg bg-bg2 px-2 py-1 text-sm">
            <LogoBadge image={c.image} name={c.name} size={20} />
            {c.name}
          </li>
        ))}
      </ul>
      {!n.system && (
        <Link to={`/zones/${encodeURIComponent(n.name)}`} className="w-fit">
          <Button>{t("zones.open")}</Button>
        </Link>
      )}
      <Button onClick={() => onExport({ networkId: n.id, label: n.name })}>
        <FileDown size={14} /> {t("topology.exportButton")}
      </Button>
      {!n.system && (
        <>
          <Button
            write
            variant="danger"
            disabled={members.length > 0}
            onClick={() => setConfirm(true)}
          >
            <Trash2 size={14} /> {t("common.delete")}
          </Button>
          {members.length > 0 && (
            <p className="text-xs text-dim">{t("topology.networkNotEmpty")}</p>
          )}
          <ShowCommand command={cli.removeNetwork(n.name)} />
        </>
      )}
      <ConfirmDialog
        open={confirm}
        title={t("topology.removeNetworkTitle", { name: n.name })}
        confirmLabel={t("common.delete")}
        body={t("topology.removeNetworkBody")}
        command={cli.removeNetwork(n.name)}
        onConfirm={() => remove.mutate(undefined, { onSuccess: onGone })}
        onClose={() => setConfirm(false)}
      />
    </div>
  );
}

function TunnelInspector({ tunnel, onGone }: { tunnel: TunnelInfo; onGone: () => void }) {
  const { t } = useTranslation();
  const [confirm, setConfirm] = useState(false);
  const remove = useApiMutation(
    () => api.removeContainer(tunnel.containerId, true),
    [keys.containers, keys.networks],
  );
  const isAdmin = useIsAdmin();
  useCanvasShortcuts({ remove: isAdmin ? () => setConfirm(true) : undefined });
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="font-semibold">{t("tunnel.title")}</div>
        <div className="font-mono text-xs text-dim">{tunnel.name}</div>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-dim">{t("tunnel.from")}</dt>
        <dd className="font-mono">
          {tunnel.from}:{tunnel.listenPort}
        </dd>
        <dt className="text-dim">{t("tunnel.to")}</dt>
        <dd className="font-mono">
          {tunnel.targetName}:{tunnel.targetPort} <span className="text-dim">({tunnel.to})</span>
        </dd>
      </dl>
      <p className="text-sm text-dim">{t("tunnel.explain", { port: tunnel.targetPort })}</p>
      <Button write variant="danger" onClick={() => setConfirm(true)}>
        <Trash2 size={14} /> {t("tunnel.remove")}
      </Button>
      <ShowCommand command={cli.removeContainer(tunnel.name, true)} />
      <ConfirmDialog
        open={confirm}
        title={t("tunnel.removeTitle", { name: tunnel.name })}
        confirmLabel={t("common.delete")}
        body={t("tunnel.removeBody", { from: tunnel.from, to: tunnel.to })}
        command={cli.removeContainer(tunnel.name, true)}
        onConfirm={() => remove.mutate(undefined, { onSuccess: onGone })}
        onClose={() => setConfirm(false)}
      />
    </div>
  );
}
