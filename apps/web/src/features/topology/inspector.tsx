import type { Container, ContainerAction, Network } from "@nautix/contracts";
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
import { keys } from "../../app/queries.js";
import { useApiMutation } from "../../app/use-api-mutation.js";
import { Button, ConfirmDialog, ShowCommand, TypeConfirmDialog } from "../../components/ui.js";
import type { ExportTarget } from "./export-dialog.js";
import { LogoBadge } from "./logo-badge.js";

export type Selection = { kind: "container"; id: string } | { kind: "zone"; id: string } | null;

export function Inspector({
  selection,
  containers,
  networks,
  onClearSelection,
  onExport,
}: {
  selection: Selection;
  containers: Container[];
  networks: Network[];
  onClearSelection: () => void;
  onExport: (target: ExportTarget) => void;
}) {
  const { t } = useTranslation();
  const container =
    selection?.kind === "container" ? containers.find((c) => c.id === selection.id) : undefined;
  const network =
    selection?.kind === "zone" ? networks.find((n) => n.id === selection.id) : undefined;

  return (
    <aside
      className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-l border-line bg-bg1 p-4"
      aria-label={t("topology.inspector")}
    >
      <h2 className="font-mono text-xs uppercase tracking-wider text-dim">
        {t("topology.inspector")}
      </h2>
      {container && (
        <ContainerInspector container={container} networks={networks} onGone={onClearSelection} />
      )}
      {network && (
        <NetworkInspector
          network={network}
          containers={containers}
          onGone={onClearSelection}
          onExport={onExport}
        />
      )}
      {!container && !network && <p className="text-sm text-dim">{t("topology.inspectorEmpty")}</p>}
    </aside>
  );
}

function ContainerInspector({
  container: c,
  networks,
  onGone,
}: {
  container: Container;
  networks: Network[];
  onGone: () => void;
}) {
  const { t } = useTranslation();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const refresh = [keys.containers, keys.networks];

  const confirm = c.isSelf ? c.name : undefined;
  const [pendingSelf, setPendingSelf] = useState<(() => void) | null>(null);
  // Nautix's own container needs the name typed before anything that could take it down.
  const guard = (run: () => void) => (c.isSelf ? setPendingSelf(() => run) : run());
  const act = useApiMutation(
    (a: ContainerAction) => api.containerAction(c.id, a, confirm),
    refresh,
  );
  const remove = useApiMutation(() => api.removeContainer(c.id, true, confirm), refresh);
  const leave = useApiMutation(
    (networkId: string) => api.disconnect(networkId, c.id, confirm),
    refresh,
  );
  const join = useApiMutation((networkId: string) => api.connect(networkId, c.id), refresh);
  const joinable = networks.filter((n) => !n.system && !c.networks.includes(n.name));
  const logs = useQuery({
    queryKey: ["logs", c.id],
    queryFn: () => api.logs(c.id),
    enabled: showLogs,
    refetchInterval: showLogs ? 3000 : false,
  });

  const running = c.state === "running";
  const published = c.ports.filter((p) => p.publicPort !== undefined);
  const memberOf = networks.filter((n) => c.networks.includes(n.name));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <LogoBadge image={c.image} name={c.name} />
        <div className="min-w-0">
          <div className="truncate font-semibold">{c.name}</div>
          <div className="truncate font-mono text-xs text-dim">{c.image}</div>
        </div>
      </div>
      <div className="text-sm">
        <span className="text-dim">{t("common.status")}: </span>
        {t(`containers.state.${c.state}`)} · <span className="text-dim">{c.status}</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {running ? (
          <>
            <Button onClick={() => guard(() => act.mutate("stop"))} disabled={act.isPending}>
              <Square size={14} /> {t("containers.stop")}
            </Button>
            <Button onClick={() => guard(() => act.mutate("restart"))} disabled={act.isPending}>
              <RotateCw size={14} /> {t("containers.restart")}
            </Button>
            <Link
              to={`/terminal/${c.id}`}
              className="inline-flex items-center gap-2 rounded-lg border border-line bg-bg1 px-3 py-1.5 text-sm font-medium hover:bg-bg2"
            >
              <SquareTerminal size={14} /> {t("terminal.open_btn")}
            </Link>
          </>
        ) : (
          <Button variant="primary" onClick={() => act.mutate("start")} disabled={act.isPending}>
            <Play size={14} /> {t("containers.start")}
          </Button>
        )}
        <Button variant="danger" onClick={() => setConfirmRemove(true)}>
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
              {!n.system && (
                <button
                  type="button"
                  title={t("topology.disconnect")}
                  aria-label={`${t("topology.disconnect")} ${n.name}`}
                  className="text-dim hover:text-danger"
                  onClick={() => guard(() => leave.mutate(n.id))}
                >
                  <Unplug size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
        {joinable.length > 0 && (
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
            const open = p.ip === "0.0.0.0" || p.ip === "::" || p.ip === undefined;
            return (
              <li
                key={`${p.ip}:${p.publicPort}:${p.privatePort}`}
                className="flex items-center justify-between rounded-lg bg-bg2 px-2 py-1 font-mono text-xs"
              >
                <span>
                  {p.ip ?? "0.0.0.0"}:{p.publicPort} → {p.privatePort}/{p.type}
                </span>
                {open ? (
                  <ShieldAlert
                    size={14}
                    className="text-amber"
                    aria-label={t("topology.publicPort")}
                  />
                ) : (
                  <Lock size={14} className="text-cyan" aria-label={t("topology.protectedPort")} />
                )}
              </li>
            );
          })}
        </ul>
      </section>

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

      <TypeConfirmDialog
        open={pendingSelf !== null}
        name={c.name}
        onConfirm={() => pendingSelf?.()}
        onClose={() => setPendingSelf(null)}
      />
      <ConfirmDialog
        open={confirmRemove}
        title={t("topology.removeContainerTitle", { name: c.name })}
        body={t("topology.removeContainerBody", { image: c.image })}
        command={cli.removeContainer(c.name, true)}
        onConfirm={() => guard(() => remove.mutate(undefined, { onSuccess: onGone }))}
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
      <Button onClick={() => onExport({ networkId: n.id, label: n.name })}>
        <FileDown size={14} /> {t("topology.exportButton")}
      </Button>
      {!n.system && (
        <>
          <Button variant="danger" disabled={members.length > 0} onClick={() => setConfirm(true)}>
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
        body={t("topology.removeNetworkBody")}
        command={cli.removeNetwork(n.name)}
        onConfirm={() => remove.mutate(undefined, { onSuccess: onGone })}
        onClose={() => setConfirm(false)}
      />
    </div>
  );
}
