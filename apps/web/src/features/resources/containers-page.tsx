import type { Container, ContainerAction } from "@nautix/contracts";
import { Play, RotateCw, Square, SquareTerminal, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { api } from "../../app/api.js";
import { cli } from "../../app/cli.js";
import { keys, useContainers, useIsAdmin } from "../../app/queries.js";
import { useApiMutation } from "../../app/use-api-mutation.js";
import { useListSelection } from "../../app/use-list-selection.js";
import { BulkDeleteBar } from "../../components/bulk-delete.js";
import { Button, ConfirmDialog, Input } from "../../components/ui.js";
import { statusText } from "../containers/status-text.js";
import { LogoBadge } from "../topology/logo-badge.js";
import {
  type ContainerFilter,
  composeProjects,
  filterContainers,
  NO_FILTER,
} from "./container-filters.js";
import { PageHeader, RowCheck, Table, Td } from "./table.js";

export function ContainersPage() {
  const { t } = useTranslation();
  const { data = [] } = useContainers();
  const isAdmin = useIsAdmin();
  const [target, setTarget] = useState<Container | null>(null);
  const [filter, setFilter] = useState<ContainerFilter>(NO_FILTER);
  const shown = filterContainers(data, filter);
  const sel = useListSelection(
    shown,
    (c) => c.id,
    (c) => c.isSelf !== true,
  );
  const act = useApiMutation(
    ({ c, action }: { c: Container; action: ContainerAction }) => api.containerAction(c.id, action),
    [keys.containers],
  );
  const remove = useApiMutation(
    (c: Container) => api.removeContainer(c.id, true),
    [keys.containers, keys.networks],
  );

  return (
    <div className="p-6">
      <PageHeader title={t("containers.title")} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input
          aria-label={t("containers.filterText")}
          placeholder={t("containers.filterText")}
          value={filter.text}
          onChange={(e) => setFilter({ ...filter, text: e.target.value })}
          className="w-56"
        />
        <select
          aria-label={t("common.status")}
          value={filter.status}
          onChange={(e) =>
            setFilter({ ...filter, status: e.target.value as ContainerFilter["status"] })
          }
          className="rounded-lg border border-line bg-bg0 px-2 py-2 text-sm text-fg"
        >
          <option value="all">{t("containers.statusAll")}</option>
          <option value="running">{t("containers.statusRunning")}</option>
          <option value="stopped">{t("containers.statusStopped")}</option>
        </select>
        <select
          aria-label={t("containers.project")}
          value={filter.project}
          onChange={(e) => setFilter({ ...filter, project: e.target.value })}
          className="rounded-lg border border-line bg-bg0 px-2 py-2 text-sm text-fg"
        >
          <option value="">{t("containers.projectAll")}</option>
          {composeProjects(data).map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <Input
          aria-label={t("containers.filterLabel")}
          placeholder={t("containers.filterLabel")}
          value={filter.label}
          onChange={(e) => setFilter({ ...filter, label: e.target.value })}
          className="w-48"
        />
      </div>
      <BulkDeleteBar
        items={sel.rows.map((c) => ({
          kind: "containers" as const,
          id: c.id,
          name: c.name,
          running: c.state === "running",
        }))}
        invalidate={[keys.containers, keys.networks]}
        onDone={sel.clear}
        onClear={sel.clear}
      />
      <Table
        selection={sel.table(t("bulk.selectAll"))}
        head={[
          t("common.name"),
          t("common.image"),
          t("common.status"),
          t("common.ports"),
          t("common.networks"),
          t("common.actions"),
        ]}
        empty={shown.length === 0}
      >
        {shown.map((c) => (
          <tr key={c.id}>
            <RowCheck
              checked={sel.has(c.id)}
              onChange={() => sel.toggle(c.id)}
              label={t("bulk.selectRow", { name: c.name })}
              disabled={c.isSelf === true}
            />
            <Td>
              <span className="flex items-center gap-2 font-medium">
                <LogoBadge image={c.image} name={c.name} size={28} />
                <Link className="hover:text-accent hover:underline" to={`/containers/${c.id}`}>
                  {c.name}
                </Link>
              </span>
            </Td>
            <Td mono>{c.image}</Td>
            <Td>
              {t(`containers.state.${c.state}`)}{" "}
              <span className="text-dim">· {statusText(c.status, t)}</span>
            </Td>
            <Td mono>
              {c.ports
                .filter((p) => p.publicPort)
                .map((p) => `${p.ip ?? "0.0.0.0"}:${p.publicPort}→${p.privatePort}`)
                .join(", ") || "—"}
            </Td>
            <Td mono>{c.networks.join(", ") || "—"}</Td>
            <Td>
              <div className="flex gap-1">
                {c.state === "running" ? (
                  <>
                    <Button
                      write
                      aria-label={`${t("containers.stop")} ${c.name}`}
                      disabled={c.isSelf === true}
                      title={cli.containerAction("stop", c.name)}
                      onClick={() => act.mutate({ c, action: "stop" })}
                    >
                      <Square size={14} />
                    </Button>
                    {isAdmin && !c.isSelf && (
                      <Link
                        to={`/terminal/${c.id}`}
                        aria-label={`${t("terminal.open_btn")} ${c.name}`}
                        className="inline-flex items-center rounded-lg border border-line bg-bg1 px-3 py-1.5 hover:bg-bg2"
                      >
                        <SquareTerminal size={14} />
                      </Link>
                    )}
                    <Button
                      write
                      aria-label={`${t("containers.restart")} ${c.name}`}
                      disabled={c.isSelf === true}
                      title={cli.containerAction("restart", c.name)}
                      onClick={() => act.mutate({ c, action: "restart" })}
                    >
                      <RotateCw size={14} />
                    </Button>
                  </>
                ) : (
                  <Button
                    write
                    aria-label={`${t("containers.start")} ${c.name}`}
                    title={cli.containerAction("start", c.name)}
                    onClick={() => act.mutate({ c, action: "start" })}
                  >
                    <Play size={14} />
                  </Button>
                )}
                <Button
                  write
                  variant="danger"
                  aria-label={`${t("containers.remove")} ${c.name}`}
                  disabled={c.isSelf === true}
                  onClick={() => setTarget(c)}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            </Td>
          </tr>
        ))}
      </Table>
      <ConfirmDialog
        open={target !== null}
        title={t("topology.removeContainerTitle", { name: target?.name ?? "" })}
        confirmLabel={t("common.delete")}
        requireText={target?.name ?? ""}
        body={t("topology.removeContainerBody", { image: target?.image ?? "" })}
        command={target ? cli.removeContainer(target.name, true) : ""}
        onConfirm={() => target && remove.mutate(target)}
        onClose={() => setTarget(null)}
      />
    </div>
  );
}
