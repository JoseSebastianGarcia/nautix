import { applyFix, lintDockerfile, parseDockerfile, stageGraph } from "@nautix/dockerfile";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Hammer,
  Info,
  Plus,
  Redo2,
  Undo2,
  X,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { buildImage } from "../../app/api.js";
import { keys } from "../../app/queries.js";
import { DockerfileEditor } from "../../components/dockerfile-editor.js";
import { EnvEditor } from "../../components/fields.js";
import { useToasts } from "../../components/toast-store.js";
import { Button, Field, Input } from "../../components/ui.js";
import { canRedo, canUndo, commit, initialHistory, redo, undo } from "../compose/history.js";
import { PageHeader } from "../resources/table.js";
import { BlocksView } from "./blocks-view.js";
import { DOCKERFILE_TEMPLATES } from "./dockerfile-templates.js";

const STORAGE = "nautix.build.dockerfile";
const DEFAULT = DOCKERFILE_TEMPLATES[3]?.dockerfile ?? "FROM alpine:3.20\n";
const TAG = /^[a-zA-Z0-9][a-zA-Z0-9_.:/@-]*$/;

const load = (): string => {
  try {
    return localStorage.getItem(STORAGE) ?? DEFAULT;
  } catch {
    return DEFAULT;
  }
};

const ICON = { error: AlertCircle, warning: AlertTriangle, info: Info } as const;
const COLOR = { error: "text-danger", warning: "text-amber", info: "text-dim" } as const;

interface ExtraFile {
  path: string;
  content: string;
}

export function BuildsPage() {
  const { t } = useTranslation();
  const push = useToasts((s) => s.push);
  const qc = useQueryClient();
  const [history, setHistory] = useState(() => initialHistory(load()));
  const dockerfile = history.present;
  const [view, setView] = useState<"blocks" | "code">("blocks");
  const [stageFilter, setStageFilter] = useState<number | null>(null);
  const [tag, setTag] = useState("my-app:latest");
  const [args, setArgs] = useState<[string, string][]>([]);
  const [files, setFiles] = useState<ExtraFile[]>([]);
  const [target, setTarget] = useState("");
  const [noCache, setNoCache] = useState(false);
  const [pull, setPull] = useState(false);
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);
  const outputRef = useRef<HTMLPreElement>(null);

  const remember = (text: string) => {
    try {
      localStorage.setItem(STORAGE, text);
    } catch {
      /* storage may be unavailable */
    }
  };
  /** Typing is coalesced into one undo step; block edits and fixes are one step each. */
  const update = (text: string, coalesceMs = 0) => {
    setHistory((h) => commit(h, text, Date.now(), coalesceMs));
    remember(text);
  };
  const stepUndo = () => {
    const h = undo(history);
    setHistory(h);
    remember(h.present);
  };
  const stepRedo = () => {
    const h = redo(history);
    setHistory(h);
    remember(h.present);
  };

  const issues = useMemo(() => lintDockerfile(dockerfile), [dockerfile]);
  const graph = useMemo(() => stageGraph(parseDockerfile(dockerfile)), [dockerfile]);
  const stageNames = graph.nodes.map((n) => n.label).filter((l) => !l.startsWith("stage "));
  const blocking = issues.some((i) => i.severity === "error");
  const tagValid = TAG.test(tag);
  const filesValid = files.every(
    (f) => /^[A-Za-z0-9._-][A-Za-z0-9._/-]{0,98}$/.test(f.path) && !f.path.includes(".."),
  );

  const run = async () => {
    setOutput("");
    setRunning(true);
    try {
      const ok = await buildImage(
        {
          tag,
          dockerfile,
          files,
          buildArgs: Object.fromEntries(args.filter(([k]) => k.trim() !== "")),
          ...(target ? { target } : {}),
          noCache,
          pull,
        },
        (chunk) => {
          setOutput((o) => o + chunk);
          queueMicrotask(() =>
            outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight }),
          );
        },
      );
      push(ok ? "ok" : "error", ok ? t("builds.done", { tag }) : t("builds.failed"));
      if (ok) void qc.invalidateQueries({ queryKey: keys.images });
    } catch (error) {
      push("error", error instanceof Error ? error.message : t("errors.generic"));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-6">
      <PageHeader
        title={t("builds.title")}
        actions={
          <select
            aria-label={t("builds.template")}
            value=""
            onChange={(e) => {
              const tpl = DOCKERFILE_TEMPLATES.find((x) => x.id === e.target.value);
              if (tpl) update(tpl.dockerfile);
            }}
            className="rounded-lg border border-line bg-bg0 px-2 py-2 text-sm text-fg"
          >
            <option value="">{t("builds.template")}…</option>
            {DOCKERFILE_TEMPLATES.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                {t(`builds.templates.${tpl.id}`)}
              </option>
            ))}
          </select>
        }
      />
      <p className="text-xs text-dim">{t("builds.intro")}</p>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div role="tablist" className="flex rounded-lg border border-line p-0.5 text-sm">
              {(["blocks", "code"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="tab"
                  aria-selected={view === v}
                  onClick={() => setView(v)}
                  className={`rounded-md px-3 py-1 ${view === v ? "bg-accent-soft text-accent" : "text-dim hover:text-fg"}`}
                >
                  {t(`builds.view.${v}`)}
                </button>
              ))}
            </div>
            <Button aria-label={t("compose.undo")} disabled={!canUndo(history)} onClick={stepUndo}>
              <Undo2 size={14} />
            </Button>
            <Button aria-label={t("compose.redo")} disabled={!canRedo(history)} onClick={stepRedo}>
              <Redo2 size={14} />
            </Button>
          </div>
          {view === "code" ? (
            <div className="h-[420px]">
              <DockerfileEditor
                value={dockerfile}
                onChange={(text) => update(text, 500)}
                onUndo={stepUndo}
                onRedo={stepRedo}
                label="Dockerfile"
              />
            </div>
          ) : (
            <BlocksView
              text={dockerfile}
              onChange={(text) => update(text, 400)}
              issues={issues}
              stage={stageFilter}
            />
          )}

          {graph.nodes.length > 1 && (
            <ol
              className="flex flex-wrap items-center gap-2 text-xs"
              aria-label={t("builds.stages")}
            >
              {graph.nodes.map((n, i) => (
                <li key={n.id} className="flex items-center gap-2">
                  {i > 0 && <ArrowRight size={12} className="text-dim" />}
                  <button
                    type="button"
                    aria-pressed={stageFilter === i}
                    title={t("builds.blocks.filterStage")}
                    onClick={() => setStageFilter(stageFilter === i ? null : i)}
                    className={`rounded-lg border px-2 py-1 font-mono ${stageFilter === i ? "bg-accent-soft" : ""} ${n.final ? "border-accent text-accent" : "border-line"}`}
                  >
                    {n.label} <span className="text-dim">← {n.base}</span>
                  </button>
                </li>
              ))}
            </ol>
          )}

          <section aria-label={t("builds.issues")} className="flex flex-col gap-1">
            <h3 className="text-xs uppercase tracking-wider text-dim">
              {t("builds.issues")} ({issues.length})
            </h3>
            {issues.length === 0 && <p className="text-sm text-dim">{t("builds.noIssues")}</p>}
            {issues.map((i) => {
              const Icon = ICON[i.severity];
              return (
                <div
                  key={`${i.rule}:${i.line}`}
                  className="flex items-start gap-2 rounded-lg border border-line px-3 py-2 text-sm"
                >
                  <Icon size={14} className={`mt-0.5 shrink-0 ${COLOR[i.severity]}`} />
                  <span className="min-w-0 flex-1">
                    <span className="font-mono text-xs text-dim">
                      {i.rule} · {t("builds.line", { line: i.line })}
                    </span>
                    <br />
                    {t(`builds.rules.${i.rule}`, i.params)}
                  </span>
                  {i.fix && (
                    <Button onClick={() => update(applyFix(dockerfile, i.fix as never))}>
                      {t("builds.fix")}
                    </Button>
                  )}
                </div>
              );
            })}
          </section>
        </div>

        <aside className="flex flex-col gap-4">
          <Field label={t("builds.tag")}>
            <Input
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              aria-invalid={!tagValid}
              placeholder="my-app:1.0"
            />
          </Field>
          {stageNames.length > 0 && (
            <Field label={t("builds.target")} hint={t("builds.targetHint")}>
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="rounded-lg border border-line bg-bg0 px-2 py-2 text-sm text-fg"
              >
                <option value="">{t("builds.lastStage")}</option>
                {stageNames.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <EnvEditor label={t("builds.args")} entries={args} onChange={setArgs} />
          <p className="-mt-2 text-xs text-amber">{t("builds.argsWarning")}</p>

          <section className="flex flex-col gap-2">
            <h3 className="text-xs uppercase tracking-wider text-dim">{t("builds.files")}</h3>
            <p className="text-xs text-dim">{t("builds.filesHint")}</p>
            {files.map((f, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional drafts
              <div key={i} className="flex flex-col gap-1 rounded-lg border border-line p-2">
                <div className="flex gap-2">
                  <Input
                    aria-label={t("builds.filePath")}
                    placeholder="package.json"
                    value={f.path}
                    onChange={(e) =>
                      setFiles(files.map((x, j) => (j === i ? { ...x, path: e.target.value } : x)))
                    }
                  />
                  <button
                    type="button"
                    aria-label={t("topology.remove")}
                    className="text-dim hover:text-danger"
                    onClick={() => setFiles(files.filter((_, j) => j !== i))}
                  >
                    <X size={14} />
                  </button>
                </div>
                <textarea
                  aria-label={t("builds.fileContent")}
                  className="h-20 rounded-lg border border-line bg-bg0 p-2 font-mono text-xs"
                  value={f.content}
                  onChange={(e) =>
                    setFiles(files.map((x, j) => (j === i ? { ...x, content: e.target.value } : x)))
                  }
                />
              </div>
            ))}
            <Button onClick={() => setFiles([...files, { path: "", content: "" }])}>
              <Plus size={14} /> {t("builds.addFile")}
            </Button>
          </section>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={noCache}
              onChange={(e) => setNoCache(e.target.checked)}
            />
            {t("builds.noCache")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={pull} onChange={(e) => setPull(e.target.checked)} />
            {t("builds.pull")}
          </label>
          <Button
            write
            variant="primary"
            disabled={running || blocking || !tagValid || !filesValid}
            onClick={() => void run()}
          >
            <Hammer size={14} /> {running ? t("builds.building") : t("builds.build")}
          </Button>
          {blocking && <p className="text-xs text-danger">{t("builds.blocked")}</p>}
        </aside>
      </div>

      {(output || running) && (
        <pre
          ref={outputRef}
          role="log"
          aria-label={t("builds.output")}
          className="max-h-80 overflow-auto rounded-xl border border-line bg-bg0 p-3 font-mono text-xs whitespace-pre-wrap"
        >
          {output}
        </pre>
      )}
    </div>
  );
}
