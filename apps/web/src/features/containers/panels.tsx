import type { Container } from "@nautix/contracts";
import { KILL_SIGNALS } from "@nautix/contracts";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../app/api.js";
import { Button, Field, Input, ShowCommand } from "../../components/ui.js";
import { formatBytes } from "../resources/format.js";
import { filterLines, percent, pushSample, sparklinePoints } from "./details-utils.js";
import { JsonTree } from "./json-tree.js";

export function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-line bg-bg1 p-4">
      <h3 className="text-xs uppercase tracking-wider text-dim">{title}</h3>
      {children}
    </section>
  );
}

const Table = ({ head, rows }: { head: string[]; rows: ReactNode[][] }) => (
  <div className="overflow-x-auto rounded-xl border border-line bg-bg1">
    <table className="w-full text-left font-mono text-xs">
      <thead className="border-b border-line text-dim">
        <tr>
          {head.map((h) => (
            <th key={h} className="px-3 py-2 font-medium">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {rows.map((r, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional
          <tr key={i}>
            {r.map((c, j) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: cells are positional
              <td key={j} className="px-3 py-1.5">
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export function LogsPanel({ container }: { container: Container }) {
  const { t } = useTranslation();
  const [tail, setTail] = useState(300);
  const [query, setQuery] = useState("");
  const [follow, setFollow] = useState(true);
  const [since, setSince] = useState(0);
  const logs = useQuery({
    queryKey: ["logs", container.id, tail, since],
    queryFn: () => api.logs(container.id, tail, since || undefined),
    refetchInterval: follow ? 3000 : false,
  });
  const lines = filterLines(logs.data?.logs ?? "", query);
  const download = () => {
    const url = URL.createObjectURL(new Blob([logs.data?.logs ?? ""], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${container.name}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label={t("details.search")}
          placeholder={t("details.search")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-64"
        />
        <select
          aria-label={t("details.tail")}
          value={tail}
          onChange={(e) => setTail(Number(e.target.value))}
          className="rounded-lg border border-line bg-bg0 px-2 py-2 text-sm text-fg"
        >
          {[100, 300, 1000, 5000].map((n) => (
            <option key={n} value={n}>
              {t("details.lastLines", { n })}
            </option>
          ))}
        </select>
        <select
          aria-label={t("details.since")}
          value={since}
          onChange={(e) => setSince(Number(e.target.value))}
          className="rounded-lg border border-line bg-bg0 px-2 py-2 text-sm text-fg"
        >
          <option value={0}>{t("details.sinceAll")}</option>
          {[300, 3600, 86400].map((n) => (
            <option key={n} value={n}>
              {t(`details.since_${n}`)}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
          {t("details.follow")}
        </label>
        <Button onClick={download}>{t("details.download")}</Button>
      </div>
      <pre className="max-h-[60vh] overflow-auto rounded-xl border border-line bg-bg0 p-3 font-mono text-xs leading-snug whitespace-pre-wrap">
        {lines.join("\n") || t("common.empty")}
      </pre>
      <ShowCommand
        command={`docker logs --tail ${tail}${since ? ` --since ${since}s` : ""} -t ${container.name}`}
      />
    </div>
  );
}

const Spark = ({
  values,
  max,
  label,
  color,
}: {
  values: number[];
  max?: number;
  label: string;
  color: string;
}) => (
  <svg viewBox="0 0 200 40" className="h-10 w-full" role="img" aria-label={label}>
    <polyline
      fill="none"
      stroke={color}
      strokeWidth="1.5"
      points={sparklinePoints(values, 200, 40, max)}
    />
  </svg>
);

export function StatsPanel({ container }: { container: Container }) {
  const { t } = useTranslation();
  const running = container.state === "running";
  const [cpu, setCpu] = useState<number[]>([]);
  const [mem, setMem] = useState<number[]>([]);
  const stats = useQuery({
    queryKey: ["stats", container.id],
    queryFn: () => api.stats(container.id),
    enabled: running,
    refetchInterval: 2000,
  });
  const sample = stats.data;
  useEffect(() => {
    if (!sample) return;
    setCpu((s) => pushSample(s, sample.cpuPercent));
    setMem((s) => pushSample(s, sample.memoryBytes));
  }, [sample]);

  if (!running) return <p className="text-sm text-dim">{t("details.notRunning")}</p>;
  if (!sample) return <p className="text-sm text-dim">{t("common.loading")}</p>;
  const memPct = percent(sample.memoryBytes, sample.memoryLimitBytes);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card title="CPU">
        <div className="text-2xl font-semibold">{sample.cpuPercent.toFixed(1)}%</div>
        <Spark values={cpu} max={Math.max(100, ...cpu)} label="CPU" color="var(--nx-accent)" />
      </Card>
      <Card title={t("details.memory")}>
        <div className="text-2xl font-semibold">
          {formatBytes(sample.memoryBytes)}{" "}
          <span className="text-sm font-normal text-dim">
            / {sample.memoryLimitBytes ? formatBytes(sample.memoryLimitBytes) : "∞"} ({memPct}%)
          </span>
        </div>
        <div
          className="h-2 overflow-hidden rounded bg-bg2"
          role="progressbar"
          aria-valuenow={memPct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="h-full bg-cyan" style={{ width: `${memPct}%` }} />
        </div>
        <Spark values={mem} label={t("details.memory")} color="var(--nx-cyan)" />
      </Card>
      <Card title={t("details.network")}>
        <div className="font-mono text-sm">
          ↓ {formatBytes(sample.networkRxBytes)} · ↑ {formatBytes(sample.networkTxBytes)}
        </div>
      </Card>
      <Card title="PIDs">
        <div className="text-2xl font-semibold">{sample.pids}</div>
      </Card>
      <div className="md:col-span-2">
        <ShowCommand command={`docker stats --no-stream ${container.name}`} />
      </div>
    </div>
  );
}

export function ProcessesPanel({ container }: { container: Container }) {
  const { t } = useTranslation();
  const running = container.state === "running";
  const top = useQuery({
    queryKey: ["top", container.id],
    queryFn: () => api.top(container.id),
    enabled: running,
    refetchInterval: 3000,
  });
  if (!running) return <p className="text-sm text-dim">{t("details.notRunning")}</p>;
  return (
    <div className="flex flex-col gap-3">
      <Table head={top.data?.titles ?? []} rows={top.data?.processes ?? []} />
      <ShowCommand command={`docker top ${container.name}`} />
    </div>
  );
}

const KIND_COLOR = { added: "text-ok", modified: "text-amber", deleted: "text-danger" } as const;

export function ChangesPanel({ container }: { container: Container }) {
  const { t } = useTranslation();
  const diff = useQuery({
    queryKey: ["diff", container.id],
    queryFn: () => api.diff(container.id),
  });
  const rows = (diff.data ?? []).map((c) => [
    <span key="k" className={KIND_COLOR[c.kind]}>
      {t(`details.change.${c.kind}`)}
    </span>,
    c.path,
  ]);
  return (
    <div className="flex flex-col gap-3">
      {rows.length === 0 ? (
        <p className="text-sm text-dim">{t("details.noChanges")}</p>
      ) : (
        <Table head={[t("details.kind"), t("details.path")]} rows={rows} />
      )}
      <ShowCommand command={`docker diff ${container.name}`} />
    </div>
  );
}

export function InspectPanel({ container }: { container: Container }) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState("");
  const [raw, setRaw] = useState(false);
  const data = useQuery({
    queryKey: ["inspect", container.id],
    queryFn: () => api.inspect("containers", container.id),
  });
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Input
          aria-label={t("details.search")}
          placeholder={t("details.search")}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-64"
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={raw} onChange={(e) => setRaw(e.target.checked)} />
          {t("details.rawJson")}
        </label>
      </div>
      <div className="max-h-[65vh] overflow-auto rounded-xl border border-line bg-bg0 p-3">
        {data.isLoading ? (
          <p className="text-sm text-dim">{t("common.loading")}</p>
        ) : raw ? (
          <pre className="font-mono text-xs whitespace-pre-wrap">
            {JSON.stringify(data.data, null, 2)}
          </pre>
        ) : (
          <JsonTree value={data.data} filter={filter} />
        )}
      </div>
      <ShowCommand command={`docker inspect ${container.name}`} />
    </div>
  );
}

export function FilesPanel({ container }: { container: Container }) {
  const { t } = useTranslation();
  const [path, setPath] = useState("/");
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const valid = path.startsWith("/") && path.length <= 4096;
  return (
    <div className="flex flex-col gap-4">
      <Field label={t("details.path")} hint={t("details.pathHint")}>
        <Input value={path} onChange={(e) => setPath(e.target.value)} aria-invalid={!valid} />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <a
          href={
            valid
              ? `/api/v1/containers/${container.id}/archive?path=${encodeURIComponent(path)}`
              : undefined
          }
          className="inline-flex items-center rounded-lg border border-line bg-bg1 px-3 py-1.5 text-sm font-medium hover:bg-bg2"
          download
        >
          {t("details.downloadTar")}
        </a>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-bg1 px-3 py-1.5 text-sm font-medium hover:bg-bg2">
          {t("details.uploadTar")}
          <input
            type="file"
            accept=".tar,application/x-tar"
            className="sr-only"
            disabled={!valid}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setStatus("uploading");
              api.uploadArchive(container.id, path, file).then(
                () => setStatus("done"),
                () => setStatus("error"),
              );
              e.target.value = "";
            }}
          />
        </label>
        <span className="text-sm text-dim" aria-live="polite">
          {status === "uploading"
            ? t("common.loading")
            : status === "done"
              ? t("details.uploaded")
              : status === "error"
                ? t("errors.generic")
                : ""}
        </span>
      </div>
      <p className="text-xs text-dim">{t("details.filesNote")}</p>
      <ShowCommand
        command={`docker cp ${container.name}:${path} ./out\ndocker cp ./in ${container.name}:${path}`}
      />
    </div>
  );
}

export const SIGNALS = KILL_SIGNALS;
