import type { EngineEvent, PruneKind } from "@nautix/contracts";
import { useQuery } from "@tanstack/react-query";
import { Pause, Play } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../app/api.js";
import { keys } from "../../app/queries.js";
import { useApiMutation } from "../../app/use-api-mutation.js";
import { useToasts } from "../../components/toast-store.js";
import { Button, ConfirmDialog, Input, ShowCommand } from "../../components/ui.js";
import { JsonTree } from "../containers/json-tree.js";
import { Card } from "../containers/panels.js";
import { formatBytes } from "../resources/format.js";
import { PageHeader } from "../resources/table.js";

const TABS = ["overview", "prune", "events"] as const;
type Tab = (typeof TABS)[number];

export function SystemPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("overview");
  return (
    <div className="flex flex-col gap-4 p-6">
      <PageHeader title={t("system.title")} />
      <div role="tablist" className="flex gap-1 border-b border-line">
        {TABS.map((x) => (
          <button
            key={x}
            type="button"
            role="tab"
            aria-selected={tab === x}
            onClick={() => setTab(x)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === x ? "border-accent text-accent" : "border-transparent text-dim hover:text-fg"}`}
          >
            {t(`system.tab.${x}`)}
          </button>
        ))}
      </div>
      {tab === "overview" && <Overview />}
      {tab === "prune" && <PruneWizard />}
      {tab === "events" && <Events />}
    </div>
  );
}

function Overview() {
  const { t } = useTranslation();
  const info = useQuery({ queryKey: ["system-info"], queryFn: api.systemInfo });
  const version = useQuery({ queryKey: ["system-version"], queryFn: api.systemVersion });
  const df = useQuery({ queryKey: ["system-df"], queryFn: api.diskUsage });
  const [raw, setRaw] = useState<"info" | "version" | null>(null);
  const pick = (o: Record<string, unknown> | undefined, k: string): string => String(o?.[k] ?? "—");

  const buckets = df.data
    ? ([
        ["images", df.data.images],
        ["containers", df.data.containers],
        ["volumes", df.data.volumes],
        ["buildCache", df.data.buildCache],
      ] as const)
    : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Card title={t("system.engine")}>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-dim">{t("system.os")}</dt>
            <dd className="font-mono">{pick(info.data, "OperatingSystem")}</dd>
            <dt className="text-dim">{t("system.engineVersion")}</dt>
            <dd className="font-mono">{pick(info.data, "ServerVersion")}</dd>
            <dt className="text-dim">{t("system.apiVersion")}</dt>
            <dd className="font-mono">{pick(version.data, "ApiVersion")}</dd>
            <dt className="text-dim">{t("system.storage")}</dt>
            <dd className="font-mono">{pick(info.data, "Driver")}</dd>
            <dt className="text-dim">CPU / RAM</dt>
            <dd className="font-mono">
              {pick(info.data, "NCPU")} ·{" "}
              {typeof info.data?.MemTotal === "number" ? formatBytes(info.data.MemTotal) : "—"}
            </dd>
          </dl>
          <div className="flex gap-2">
            <Button onClick={() => setRaw(raw === "info" ? null : "info")}>
              {t("system.rawInfo")}
            </Button>
            <Button onClick={() => setRaw(raw === "version" ? null : "version")}>
              {t("system.rawVersion")}
            </Button>
          </div>
          <ShowCommand command={"docker info\ndocker version"} />
        </Card>
        <Card title={t("system.disk")}>
          <ul className="flex flex-col gap-2 text-sm">
            {buckets.map(([name, b]) => (
              <li
                key={name}
                className="flex items-center justify-between rounded-lg bg-bg2 px-3 py-2"
              >
                <span>
                  {t(`system.bucket.${name}`)}{" "}
                  <span className="text-dim">
                    ({b.active}/{b.count} {t("system.active")})
                  </span>
                </span>
                <span className="font-mono text-xs">
                  {formatBytes(b.sizeBytes)} ·{" "}
                  <span className="text-amber">{formatBytes(b.reclaimableBytes)}</span>{" "}
                  {t("system.reclaimable")}
                </span>
              </li>
            ))}
          </ul>
          <ShowCommand command="docker system df" />
        </Card>
      </div>
      {raw && (
        <div className="max-h-[50vh] overflow-auto rounded-xl border border-line bg-bg0 p-3">
          <JsonTree value={raw === "info" ? info.data : version.data} filter="" />
        </div>
      )}
    </div>
  );
}

const KINDS: PruneKind[] = ["containers", "images", "volumes", "networks"];

function PruneWizard() {
  const { t } = useTranslation();
  const push = useToasts((s) => s.push);
  const [kind, setKind] = useState<PruneKind>("containers");
  const [all, setAll] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const preview = useQuery({
    queryKey: ["prune-preview", kind, all],
    queryFn: () => api.prunePreview(kind, all),
  });
  const prune = useApiMutation(
    () => api.prune(kind, all),
    [keys.containers, keys.images, keys.volumes, keys.networks, ["system-df"], ["prune-preview"]],
  );
  const items = preview.data?.items ?? [];
  const showAll = kind === "images" || kind === "volumes";
  const command = `docker ${kind === "containers" ? "container" : kind.slice(0, -1)} prune${all && showAll ? (kind === "images" ? " -a" : " -a") : ""}`;

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <p className="text-sm text-dim">{t("system.pruneIntro")}</p>
      <fieldset className="flex flex-wrap gap-2">
        <legend className="sr-only">{t("system.pruneWhat")}</legend>
        {KINDS.map((k) => (
          <label
            key={k}
            className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm focus-within:outline focus-within:outline-2 focus-within:outline-accent ${kind === k ? "border-accent bg-accent-soft text-accent" : "border-line text-dim hover:text-fg"}`}
          >
            <input
              type="radio"
              name="prune-kind"
              className="sr-only"
              checked={kind === k}
              onChange={() => {
                setKind(k);
                setAll(false);
              }}
            />
            {t(`system.bucket.${k}`)}
          </label>
        ))}
      </fieldset>
      {showAll && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
          {kind === "images" ? t("system.allImages") : t("system.allVolumes")}
        </label>
      )}
      <Card title={t("system.willBeRemoved", { count: items.length })}>
        {preview.isLoading ? (
          <p className="text-sm text-dim">{t("common.loading")}</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-dim">{t("system.nothingToPrune")}</p>
        ) : (
          <ul className="max-h-64 overflow-auto font-mono text-xs">
            {items.map((i) => (
              <li
                key={`${i.kind}:${i.name}`}
                className="flex justify-between border-b border-line py-1"
              >
                <span>{i.name}</span>
                {i.size !== undefined && <span className="text-dim">{formatBytes(i.size)}</span>}
              </li>
            ))}
          </ul>
        )}
        {(preview.data?.reclaimableBytes ?? 0) > 0 && (
          <p className="text-sm text-amber">
            {t("system.reclaims", { size: formatBytes(preview.data?.reclaimableBytes ?? 0) })}
          </p>
        )}
      </Card>
      <ShowCommand command={command} />
      <div>
        <Button
          write
          variant="danger"
          disabled={items.length === 0 || prune.isPending}
          onClick={() => setConfirm(true)}
        >
          {t("system.prune")}
        </Button>
      </div>
      <ConfirmDialog
        open={confirm}
        title={t("system.confirmTitle", { kind: t(`system.bucket.${kind}`) })}
        body={t("system.confirmBody", { count: items.length })}
        command={command}
        onConfirm={() =>
          prune.mutate(undefined, {
            onSuccess: (r) =>
              push(
                "ok",
                t("system.pruned", { count: r.deleted, size: formatBytes(r.reclaimedBytes) }),
              ),
          })
        }
        onClose={() => setConfirm(false)}
      />
    </div>
  );
}

const MAX_EVENTS = 500;

function Events() {
  const { t } = useTranslation();
  const [events, setEvents] = useState<EngineEvent[]>([]);
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState("");
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    const source = new EventSource("/api/v1/system/events");
    source.onmessage = (e) => {
      if (pausedRef.current) return;
      try {
        const event = JSON.parse(e.data) as EngineEvent;
        setEvents((prev) => [event, ...prev].slice(0, MAX_EVENTS));
      } catch {
        /* ignore malformed message */
      }
    };
    return () => source.close();
  }, []);

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q
      ? events.filter((e) =>
          `${e.type} ${e.action} ${e.name ?? ""} ${e.id}`.toLowerCase().includes(q),
        )
      : events;
  }, [events, filter]);

  const exportJson = () => {
    const url = URL.createObjectURL(
      new Blob([shown.map((e) => JSON.stringify(e)).join("\n")], { type: "application/x-ndjson" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "docker-events.ndjson";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label={t("details.search")}
          placeholder={t("details.search")}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-64"
        />
        <Button onClick={() => setPaused((p) => !p)}>
          {paused ? <Play size={14} /> : <Pause size={14} />}{" "}
          {paused ? t("system.resume") : t("system.pause")}
        </Button>
        <Button onClick={() => setEvents([])}>{t("system.clear")}</Button>
        <Button onClick={exportJson} disabled={shown.length === 0}>
          {t("system.export")}
        </Button>
      </div>
      <div className="max-h-[60vh] overflow-auto rounded-xl border border-line bg-bg1">
        <table className="w-full text-left font-mono text-xs">
          <thead className="sticky top-0 border-b border-line bg-bg1 text-dim">
            <tr>
              <th className="px-3 py-2">{t("system.time")}</th>
              <th className="px-3 py-2">{t("system.type")}</th>
              <th className="px-3 py-2">{t("system.action")}</th>
              <th className="px-3 py-2">{t("common.name")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {shown.map((e, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: events have no unique id
              <tr key={i}>
                <td className="px-3 py-1.5 whitespace-nowrap">
                  {new Date(e.time * 1000).toLocaleTimeString()}
                </td>
                <td className="px-3 py-1.5">{e.type}</td>
                <td className="px-3 py-1.5">{e.action}</td>
                <td className="px-3 py-1.5">{e.name ?? e.id.slice(0, 12)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && (
          <p className="p-6 text-center text-sm text-dim">{t("system.waitingEvents")}</p>
        )}
      </div>
      <ShowCommand command="docker events" />
    </div>
  );
}
