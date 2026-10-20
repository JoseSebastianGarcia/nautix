import { ArrowLeft, Lock, SquareTerminal } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { useContainers, useIsAdmin } from "../../app/queries.js";
import { LogoBadge } from "../topology/logo-badge.js";
import { ActionsPanel } from "./actions-panel.js";
import {
  ChangesPanel,
  FilesPanel,
  InspectPanel,
  LogsPanel,
  ProcessesPanel,
  StatsPanel,
} from "./panels.js";

const TABS = ["overview", "logs", "stats", "processes", "changes", "files", "inspect"] as const;
type Tab = (typeof TABS)[number];

export function ContainerPage() {
  const { id = "" } = useParams();
  const { t } = useTranslation();
  const { data: containers = [], isLoading } = useContainers();
  const isAdmin = useIsAdmin();
  const [tab, setTab] = useState<Tab>("overview");
  const c = containers.find((x) => x.id === id || x.name === id);

  if (isLoading) return <p className="p-6 text-dim">{t("common.loading")}</p>;
  if (!c) return <p className="p-6 text-danger">{t("errors.notFound")}</p>;

  // The filesystem tabs expose data, so they are admin-only (the server enforces it too).
  const visible = TABS.filter((x) => isAdmin || x !== "files");

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          to="/containers"
          className="text-dim hover:text-fg"
          aria-label={t("containers.title")}
        >
          <ArrowLeft size={18} />
        </Link>
        <LogoBadge image={c.image} name={c.name} />
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            {c.name}
            {c.isSelf && <Lock size={14} className="text-amber" aria-label={t("self.badge")} />}
          </h1>
          <p className="font-mono text-xs text-dim">
            {c.image} · {t(`containers.state.${c.state}`)} · {c.status}
          </p>
        </div>
        {isAdmin && !c.isSelf && c.state === "running" && (
          <Link
            to={`/terminal/${c.id}`}
            className="ml-auto inline-flex items-center gap-2 rounded-lg border border-line bg-bg1 px-3 py-1.5 text-sm font-medium hover:bg-bg2"
          >
            <SquareTerminal size={14} /> {t("terminal.open_btn")}
          </Link>
        )}
      </div>

      <div role="tablist" className="flex flex-wrap gap-1 border-b border-line">
        {visible.map((x) => (
          <button
            key={x}
            type="button"
            role="tab"
            aria-selected={tab === x}
            onClick={() => setTab(x)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === x ? "border-accent text-accent" : "border-transparent text-dim hover:text-fg"}`}
          >
            {t(`details.tab.${x}`)}
          </button>
        ))}
      </div>

      {tab === "overview" && <ActionsPanel container={c} />}
      {tab === "logs" && <LogsPanel container={c} />}
      {tab === "stats" && <StatsPanel container={c} />}
      {tab === "processes" && <ProcessesPanel container={c} />}
      {tab === "changes" && <ChangesPanel container={c} />}
      {tab === "files" && isAdmin && <FilesPanel container={c} />}
      {tab === "inspect" && <InspectPanel container={c} />}
    </div>
  );
}
