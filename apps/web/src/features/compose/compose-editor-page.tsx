import { hasRisks, type Issue, parse, readCompose, validateCompose } from "@nautix/compose";
import type { ComposeAction, ComposeRunResult, Container } from "@nautix/contracts";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  CircleCheck,
  Download,
  Hammer,
  List,
  Play,
  Redo2,
  Save,
  ScrollText,
  Square,
  Undo2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { api } from "../../app/api.js";
import { keys, useContainers, useIsAdmin } from "../../app/queries.js";
import { useApiMutation } from "../../app/use-api-mutation.js";
import { useToasts } from "../../components/toast-store.js";
import { Button, Dialog } from "../../components/ui.js";
import { ComposeCanvas } from "./compose-canvas.js";
import { projectContainers } from "./compose-projects-page.js";
import { selectCanRedo, selectCanUndo, selectDirty, useComposeStore } from "./compose-store.js";
import { IssuesPanel } from "./issues-panel.js";
import { ComposeNetworkInspector } from "./network-inspector.js";
import { ServiceInspector } from "./service-inspector.js";
import { YamlEditor } from "./yaml-editor.js";

type Tab = "visual" | "yaml";
const SERVICE_LABEL = "com.docker.compose.service";

export function ComposeEditorPage() {
  const { name = "" } = useParams();
  const { t } = useTranslation();
  const isAdmin = useIsAdmin();
  const push = useToasts((s) => s.push);
  const store = useComposeStore();
  const { data: containers = [] } = useContainers();
  const [tab, setTab] = useState<Tab>("visual");
  const [output, setOutput] = useState<{ action: ComposeAction; result: ComposeRunResult } | null>(
    null,
  );
  const [confirm, setConfirm] = useState<"up" | "down" | null>(null);
  const [ackRisks, setAckRisks] = useState(false);
  const [removeVolumes, setRemoveVolumes] = useState(false);

  const project = useQuery({
    queryKey: ["compose-project", name],
    queryFn: () => api.composeProject(name),
    staleTime: Infinity,
  });
  const loaded = project.data;
  // Load once per project (not on every refetch, which would discard unsaved edits).
  useEffect(() => {
    if (loaded && useComposeStore.getState().project !== name)
      useComposeStore.getState().load(name, loaded.content);
  }, [loaded, name]);

  const text = store.history.present;
  const ready = store.project === name;
  const doc = useMemo(() => parse(text), [text]);
  const model = useMemo(() => readCompose(doc), [doc]);
  const issues: Issue[] = useMemo(() => validateCompose(doc), [doc]);
  const dirty = selectDirty(store);
  const blocked = issues.some((i) => i.level === "error");

  const states = useMemo(() => {
    const map = new Map<string, Container["state"]>();
    for (const c of projectContainers(containers, name))
      map.set(c.labels[SERVICE_LABEL] ?? "", c.state);
    return map;
  }, [containers, name]);

  const save = useApiMutation(
    () => api.saveComposeProject(name, useComposeStore.getState().history.present),
    [["compose-projects"]],
    () => t("compose.saved"),
  );
  const doSave = () =>
    save.mutate(undefined, { onSuccess: () => useComposeStore.getState().markSaved() });

  const run = useApiMutation(
    async (v: { action: ComposeAction; acknowledgeRisks?: boolean; removeVolumes?: boolean }) => {
      // The server runs the saved file, so save first.
      if (useComposeStore.getState().history.present !== useComposeStore.getState().saved) {
        await api.saveComposeProject(name, useComposeStore.getState().history.present);
        useComposeStore.getState().markSaved();
      }
      return { action: v.action, result: await api.runCompose(name, v.action, v) };
    },
    [keys.containers, keys.networks, keys.volumes, keys.images],
  );
  const runAction = (v: Parameters<typeof run.mutate>[0]) =>
    run.mutate(v, { onSuccess: (r) => setOutput(r) });

  // Global undo/redo/save, unless the user is typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const el = e.target as HTMLElement | null;
      const typing =
        el && (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.isContentEditable);
      const key = e.key.toLowerCase();
      if (key === "s") {
        e.preventDefault();
        doSave();
      } else if (!typing && key === "z") {
        e.preventDefault();
        (e.shiftKey ? store.redo : store.undo)();
      } else if (!typing && key === "y") {
        e.preventDefault();
        store.redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  if (project.isError) return <p className="p-6 text-danger">{t("errors.notFound")}</p>;
  if (!ready) return <p className="p-6 text-dim">{t("common.loading")}</p>;

  const readOnly = !isAdmin;
  const selection = store.selection;
  const service =
    selection?.kind === "service"
      ? model.services.find((s) => s.name === selection.name)
      : undefined;
  const risky = hasRisks(issues);
  const startUp = () => {
    if (risky) {
      setAckRisks(false);
      setConfirm("up");
    } else runAction({ action: "up" });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-bg1 px-4 py-2">
        <Link to="/compose" className="text-dim hover:text-fg" aria-label={t("compose.title")}>
          <ArrowLeft size={18} />
        </Link>
        <h1 className="font-mono text-sm">{name}</h1>
        {dirty && <span className="text-xs text-amber">● {t("compose.unsaved")}</span>}
        <div className="mx-2 h-5 w-px bg-line" />
        <Button
          aria-label={t("compose.undo")}
          title={t("compose.undo")}
          write
          disabled={!selectCanUndo(store)}
          onClick={store.undo}
        >
          <Undo2 size={14} />
        </Button>
        <Button
          aria-label={t("compose.redo")}
          title={t("compose.redo")}
          write
          disabled={!selectCanRedo(store)}
          onClick={store.redo}
        >
          <Redo2 size={14} />
        </Button>
        <Button write onClick={doSave} disabled={!dirty || save.isPending}>
          <Save size={14} /> {t("compose.save")}
        </Button>
        <div className="mx-2 h-5 w-px bg-line" />
        <Button write variant="primary" disabled={blocked || run.isPending} onClick={startUp}>
          <Play size={14} /> {t("compose.up")}
        </Button>
        <Button
          write
          disabled={run.isPending}
          onClick={() => (setRemoveVolumes(false), setConfirm("down"))}
        >
          <Square size={14} /> {t("compose.down")}
        </Button>
        <Button
          write
          disabled={blocked || run.isPending}
          onClick={() => runAction({ action: "pull" })}
        >
          <Download size={14} /> {t("compose.pull")}
        </Button>
        <Button
          write
          disabled={blocked || run.isPending}
          onClick={() => runAction({ action: "config" })}
        >
          <CircleCheck size={14} /> {t("compose.validate")}
        </Button>
        <Button disabled={blocked || run.isPending} onClick={() => runAction({ action: "ps" })}>
          <List size={14} /> {t("compose.ps")}
        </Button>
        <Button disabled={blocked || run.isPending} onClick={() => runAction({ action: "logs" })}>
          <ScrollText size={14} /> {t("compose.logs")}
        </Button>
        <Button
          write
          disabled={blocked || run.isPending}
          onClick={() => runAction({ action: "build" })}
        >
          <Hammer size={14} /> {t("compose.build")}
        </Button>
        <div role="tablist" className="ml-auto flex rounded-lg border border-line p-0.5 text-sm">
          {(["visual", "yaml"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={tab === v}
              onClick={() => setTab(v)}
              className={`rounded-md px-3 py-1 ${tab === v ? "bg-accent-soft text-accent" : "text-dim hover:text-fg"}`}
            >
              {t(`compose.tab.${v}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          {tab === "visual" ? (
            <ComposeCanvas model={model} states={states} readOnly={readOnly} />
          ) : (
            <div className="h-full p-3">
              <YamlEditor
                label={t("compose.tab.yaml")}
                value={text}
                readOnly={readOnly}
                onChange={store.setText}
                onUndo={store.undo}
                onRedo={store.redo}
                onSave={doSave}
              />
            </div>
          )}
        </div>
        <aside
          className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-l border-line bg-bg1 p-4"
          aria-label={t("topology.inspector")}
        >
          {selection && tab === "visual" ? (
            selection.kind === "service" && service ? (
              <ServiceInspector
                service={service}
                model={model}
                readOnly={readOnly}
                onEdit={store.edit}
                onRemoved={() => store.select(null)}
              />
            ) : selection.kind === "network" ? (
              <ComposeNetworkInspector
                name={selection.name}
                model={model}
                readOnly={readOnly}
                onEdit={store.edit}
                onRemoved={() => store.select(null)}
              />
            ) : null
          ) : (
            <p className="text-sm text-dim">{t("compose.inspectorEmpty")}</p>
          )}
          <hr className="border-line" />
          <section>
            <h2 className="mb-2 text-xs uppercase tracking-wider text-dim">
              {t("compose.issues")}
            </h2>
            <IssuesPanel
              issues={issues}
              onSelect={(s) => {
                setTab("visual");
                store.select({ kind: "service", name: s });
              }}
            />
          </section>
        </aside>
      </div>

      {output && (
        <section
          className="max-h-64 shrink-0 overflow-auto border-t border-line bg-bg1 p-3"
          aria-label={t("compose.output")}
        >
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className={output.result.ok ? "text-ok" : "text-danger"}>
              {t(`compose.${output.action}`)} ·{" "}
              {output.result.ok
                ? t("compose.succeeded")
                : t("compose.failed", { code: output.result.exitCode ?? "—" })}
            </span>
            <button
              type="button"
              className="text-dim hover:text-fg"
              onClick={() => setOutput(null)}
            >
              {t("common.close")}
            </button>
          </div>
          <pre className="whitespace-pre-wrap font-mono text-xs">{output.result.output}</pre>
        </section>
      )}

      <Dialog
        open={confirm === "up"}
        onClose={() => setConfirm(null)}
        title={t("compose.riskTitle")}
      >
        <p className="text-sm text-dim">{t("compose.riskBody")}</p>
        <IssuesPanel issues={issues.filter((i) => i.level === "risk")} onSelect={() => undefined} />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={ackRisks}
            onChange={(e) => setAckRisks(e.target.checked)}
          />
          {t("compose.riskAck")}
        </label>
        <div className="flex justify-end gap-2">
          <Button onClick={() => setConfirm(null)}>{t("common.cancel")}</Button>
          <Button
            variant="danger"
            disabled={!ackRisks}
            onClick={() => {
              setConfirm(null);
              runAction({ action: "up", acknowledgeRisks: true });
            }}
          >
            {t("compose.up")}
          </Button>
        </div>
      </Dialog>
      <Dialog
        open={confirm === "down"}
        onClose={() => setConfirm(null)}
        title={t("compose.downTitle", { name })}
      >
        <p className="text-sm text-dim">{t("compose.downBody")}</p>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={removeVolumes}
            onChange={(e) => setRemoveVolumes(e.target.checked)}
          />
          <span>
            {t("compose.removeVolumes")}
            <span className="block text-xs text-amber">{t("compose.removeVolumesWarning")}</span>
          </span>
        </label>
        <div className="flex justify-end gap-2">
          <Button onClick={() => setConfirm(null)}>{t("common.cancel")}</Button>
          <Button
            variant="danger"
            onClick={() => {
              setConfirm(null);
              runAction({ action: "down", removeVolumes });
            }}
          >
            {t("compose.down")}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
