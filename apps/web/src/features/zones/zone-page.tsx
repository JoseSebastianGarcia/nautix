import type { ZoneAction, ZoneApplyResult, ZoneNote } from "@nautix/contracts";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, AlertTriangle, ArrowLeft, Check, Minus, Redo2, Undo2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { ApiError, api } from "../../app/api.js";
import { keys } from "../../app/queries.js";
import { useToasts } from "../../components/toast-store.js";
import { Button } from "../../components/ui.js";
import {
  canRedo,
  canUndo,
  commit,
  type History,
  initialHistory,
  redo,
  undo,
} from "../compose/history.js";
import { YamlEditor } from "../compose/yaml-editor.js";
import { PageHeader } from "../resources/table.js";

const KIND_ICON = { done: Check, failed: X, skipped: Minus } as const;
const KIND_COLOR = { done: "text-ok", failed: "text-danger", skipped: "text-dim" } as const;

/** Human text for one action (the keys live under `zones.action`). */
function useActionText() {
  const { t } = useTranslation();
  const fields = (list: string[]) => list.map((f) => t(`zones.fields.${f}`)).join(", ");
  return (a: ZoneAction): string => {
    switch (a.kind) {
      case "create-network":
        return t("zones.action.create-network", { name: a.name });
      case "create-service":
      case "remove-service":
        return t(`zones.action.${a.kind}`, { service: a.service });
      case "update-service":
      case "replace-service":
        return t(`zones.action.${a.kind}`, { service: a.service, fields: fields(a.fields) });
      default:
        return t(`zones.action.${a.kind}`, {
          consumer: a.consumer,
          provider: a.provider,
          name: a.name,
        });
    }
  };
}

function Notes({ notes, tone }: { notes: ZoneNote[]; tone: "warning" | "error" }) {
  const { t } = useTranslation();
  if (notes.length === 0) return null;
  const Icon = tone === "error" ? AlertCircle : AlertTriangle;
  return (
    <ul className="flex flex-col gap-1">
      {notes.map((n) => (
        <li
          key={`${n.key}:${JSON.stringify(n.params ?? {})}`}
          className={`flex items-start gap-2 text-sm ${tone === "error" ? "text-danger" : "text-amber"}`}
        >
          <Icon size={14} className="mt-0.5 shrink-0" /> {t(`zones.notes.${n.key}`, n.params)}
        </li>
      ))}
    </ul>
  );
}

export function ZonePage() {
  const { t } = useTranslation();
  const { name = "" } = useParams();
  const qc = useQueryClient();
  const push = useToasts((s) => s.push);
  const describeAction = useActionText();
  const description = useQuery({
    queryKey: ["zone-spec", name],
    queryFn: () => api.zoneSpec(name),
  });
  const [history, setHistory] = useState<History | null>(null);
  const [allowRemovals, setAllowRemovals] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ZoneApplyResult | null>(null);
  const [debounced, setDebounced] = useState("");

  // Start from what was last applied, or from what is running.
  useEffect(() => {
    if (description.data && history === null)
      setHistory(initialHistory(description.data.stored ?? description.data.current));
  }, [description.data, history]);

  const text = history?.present ?? "";
  useEffect(() => {
    const id = setTimeout(() => setDebounced(text), 500);
    return () => clearTimeout(id);
  }, [text]);

  const planQuery = useQuery({
    queryKey: ["zone-plan", name, debounced],
    queryFn: () => api.planZone(name, debounced),
    enabled: debounced !== "",
    placeholderData: keepPreviousData,
    retry: false,
  });
  const plan = planQuery.data?.plan ?? null;
  const problems = planQuery.data?.problems ?? [];
  const settled = debounced === text && !planQuery.isFetching;
  const hasRemovals = plan?.actions.some((a) => a.kind === "remove-service") ?? false;
  const canApply =
    settled && plan !== null && plan.errors.length === 0 && plan.actions.length > 0 && !running;

  const edit = (next: string, coalesce = 0) =>
    setHistory((h) => (h ? commit(h, next, Date.now(), coalesce) : h));

  const apply = async () => {
    if (!plan) return;
    setRunning(true);
    setResult(null);
    try {
      const res = await api.applyZone(name, { spec: text, planHash: plan.hash, allowRemovals });
      setResult(res);
      push(res.ok ? "ok" : "error", res.ok ? t("zones.applied") : t("zones.applyFailed"));
    } catch (error) {
      push(
        "error",
        t(error instanceof ApiError && error.hintKey ? error.hintKey : "errors.generic"),
      );
    } finally {
      setRunning(false);
      for (const k of [
        keys.containers,
        keys.networks,
        keys.bindings,
        keys.zones,
        ["zone-spec", name],
        ["zone-plan", name],
      ])
        void qc.invalidateQueries({ queryKey: k });
    }
  };

  return (
    <div className="flex flex-col gap-4 p-6">
      <PageHeader
        title={t("zones.title", { name })}
        actions={
          <Link to="/" className="flex items-center gap-1 text-sm text-dim hover:text-fg">
            <ArrowLeft size={14} /> {t("zones.back")}
          </Link>
        }
      />
      <p className="max-w-3xl text-xs text-dim">{t("zones.intro")}</p>
      <p className="max-w-3xl text-xs text-amber">{t("zones.secrets")}</p>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <section className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              aria-label={t("compose.undo")}
              disabled={!history || !canUndo(history)}
              onClick={() => setHistory((h) => (h ? undo(h) : h))}
            >
              <Undo2 size={14} />
            </Button>
            <Button
              aria-label={t("compose.redo")}
              disabled={!history || !canRedo(history)}
              onClick={() => setHistory((h) => (h ? redo(h) : h))}
            >
              <Redo2 size={14} />
            </Button>
            <Button
              disabled={!description.data}
              onClick={() => edit(description.data?.current ?? "")}
            >
              {t("zones.loadRunning")}
            </Button>
            <Button
              disabled={!description.data?.stored}
              onClick={() => edit(description.data?.stored ?? "")}
            >
              {t("zones.loadApplied")}
            </Button>
          </div>
          <div className="h-[520px] min-w-0">
            {history && (
              <YamlEditor
                value={text}
                onChange={(v) => edit(v, 500)}
                onUndo={() => setHistory((h) => (h ? undo(h) : h))}
                onRedo={() => setHistory((h) => (h ? redo(h) : h))}
                onSave={() => undefined}
                label={t("zones.editor")}
              />
            )}
          </div>
        </section>

        <aside className="flex min-w-0 flex-col gap-3" aria-live="polite">
          <h2 className="text-xs uppercase tracking-wider text-dim">{t("zones.plan")}</h2>
          {problems.length > 0 && (
            <ul className="flex flex-col gap-1">
              {problems.map((p) => (
                <li
                  key={`${p.path}:${p.message}`}
                  className="flex items-start gap-2 text-sm text-danger"
                >
                  <AlertCircle size={14} className="mt-0.5 shrink-0" />
                  <span>
                    {p.path && <code className="mr-1 text-xs">{p.path}</code>}
                    {p.message}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {plan && (
            <>
              <Notes notes={plan.errors} tone="error" />
              {plan.actions.length === 0 && plan.errors.length === 0 && (
                <p className="text-sm text-ok">{t("zones.inSync")}</p>
              )}
              <ol className="flex flex-col gap-1">
                {plan.actions.map((a, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: the plan is an ordered list
                  <li key={i} className="rounded-lg bg-bg2 px-2 py-1 text-sm">
                    <span className="mr-2 font-mono text-xs text-dim">{i + 1}</span>
                    {describeAction(a)}
                  </li>
                ))}
              </ol>
              <Notes notes={plan.warnings} tone="warning" />
            </>
          )}
          {hasRemovals && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={allowRemovals}
                onChange={(e) => setAllowRemovals(e.target.checked)}
              />
              {t("zones.allowRemovals")}
            </label>
          )}
          <Button write variant="primary" disabled={!canApply} onClick={() => void apply()}>
            {running ? t("zones.applying") : t("zones.apply")}
          </Button>

          {result && (
            <section aria-label={t("zones.result")} className="flex flex-col gap-1">
              <h2 className="text-xs uppercase tracking-wider text-dim">{t("zones.result")}</h2>
              {result.results.map((r, i) => {
                const Icon = KIND_ICON[r.status];
                return (
                  // biome-ignore lint/suspicious/noArrayIndexKey: results follow the plan order
                  <div key={i} className="rounded-lg border border-line p-2 text-sm">
                    <span className={`flex items-center gap-2 ${KIND_COLOR[r.status]}`}>
                      <Icon size={14} /> {describeAction(r.action)}
                    </span>
                    {r.detail && (
                      <pre className="mt-1 max-h-32 overflow-auto font-mono text-xs whitespace-pre-wrap text-dim">
                        {r.detail}
                      </pre>
                    )}
                  </div>
                );
              })}
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
