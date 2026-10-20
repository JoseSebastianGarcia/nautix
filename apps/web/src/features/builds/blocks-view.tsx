import {
  formToArgs,
  type Instruction,
  insertInstruction,
  type LintIssue,
  lineCount,
  moveInstruction,
  NEW_INSTRUCTIONS,
  parseDockerfile,
  parseForm,
  removeInstruction,
  replaceInstruction,
  type Stage,
} from "@nautix/dockerfile";
import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Info,
  Plus,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/ui.js";
import { BlockForm } from "./block-forms.js";

const KEYWORD_COLOR: Record<string, string> = {
  FROM: "text-accent",
  RUN: "text-cyan",
  COPY: "text-amber",
  ADD: "text-amber",
  CMD: "text-danger",
  ENTRYPOINT: "text-danger",
};
const ICON = { error: AlertCircle, warning: AlertTriangle, info: Info } as const;
const SEVERITY = { error: "text-danger", warning: "text-amber", info: "text-dim" } as const;
const MIME = "application/x-nautix-instruction";

interface Props {
  text: string;
  onChange: (text: string) => void;
  issues: LintIssue[];
  /** Show only this stage (null = all). */
  stage: number | null;
}

/** First line after the last instruction of a stage (or of the preamble). */
const endOf = (list: Instruction[]): number => (list.at(-1)?.endLine ?? 0) + 1;

/** Blocks editor: the file text stays the source of truth, every edit patches only the lines it touches. */
export function BlocksView({ text, onChange, issues, stage }: Props) {
  const { t } = useTranslation();
  const df = useMemo(() => parseDockerfile(text), [text]);
  const [open, setOpen] = useState<Set<number>>(() => new Set());
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const all = df.instructions;
  const byLine = (ins: Instruction) =>
    issues.filter((i) => i.line >= ins.startLine && i.line <= ins.endLine);
  const stageNames = (before: number): string[] =>
    df.stages.slice(0, before).flatMap((s) => (s.name ? [s.name] : []));

  const toggle = (id: number) =>
    setOpen((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const move = (src: number, beforeLine: number) => {
    const ins = all[src];
    if (ins && ins.keyword !== "FROM") onChange(moveInstruction(text, ins, beforeLine));
  };
  const add = (list: Instruction[], keyword: string) => {
    const preset = NEW_INSTRUCTIONS.find((n) => n.keyword === keyword);
    if (preset) onChange(insertInstruction(text, endOf(list), keyword, preset.args));
  };
  const addStage = () => {
    const base = text.endsWith("\n") || text === "" ? text : `${text}\n`;
    const spaced = base === "" || base.endsWith("\n\n") ? base : `${base}\n`;
    onChange(
      insertInstruction(
        spaced,
        lineCount(spaced) + 1,
        "FROM",
        `alpine:3.20 AS stage${df.stages.length + 1}`,
      ),
    );
  };

  const renderBlock = (ins: Instruction, stageIndex: number | null) => {
    const id = all.indexOf(ins);
    const list = stageIndex === null ? df.preamble : (df.stages[stageIndex] as Stage).instructions;
    const pos = list.indexOf(ins);
    const prev = list[pos - 1];
    const next = list[pos + 1];
    const form = parseForm(ins.keyword, ins.args);
    const found = byLine(ins);
    const expanded = open.has(id);
    const isFrom = ins.keyword === "FROM";
    return (
      <li
        key={`${id}-${ins.keyword}`}
        onDragOver={(e) => {
          if (dragging === null) return;
          e.preventDefault();
          setOver(id);
        }}
        onDrop={(e) => {
          e.preventDefault();
          const src = Number(e.dataTransfer.getData(MIME));
          setOver(null);
          setDragging(null);
          if (Number.isInteger(src) && src !== id) move(src, ins.spanStart);
        }}
        className={`rounded-xl border bg-bg1 ${over === id && dragging !== null ? "border-accent" : "border-line"}`}
      >
        <div className="flex items-center gap-2 px-3 py-2">
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            draggable={!isFrom}
            onDragStart={(e) => {
              e.dataTransfer.setData(MIME, String(id));
              setDragging(id);
            }}
            onDragEnd={() => {
              setDragging(null);
              setOver(null);
            }}
            title={isFrom ? undefined : t("builds.blocks.drag")}
            className={`shrink-0 ${isFrom ? "text-line" : "cursor-grab text-dim"}`}
          >
            <GripVertical size={14} />
          </button>
          <button
            type="button"
            aria-expanded={expanded}
            aria-label={`${ins.keyword} ${ins.args.slice(0, 40)}`}
            onClick={() => toggle(id)}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span
              className={`w-24 shrink-0 font-mono text-xs font-semibold ${KEYWORD_COLOR[ins.keyword] ?? "text-fg"}`}
            >
              {ins.keyword}
            </span>
            <span className="truncate font-mono text-xs text-dim">
              {ins.args.replace(/\s+/g, " ")}
            </span>
          </button>
          {found.map((f) => {
            const Icon = ICON[f.severity];
            return (
              <span
                key={`${f.rule}-${f.line}`}
                title={`${f.rule}: ${t(`builds.rules.${f.rule}`, f.params)}`}
                className={SEVERITY[f.severity]}
              >
                <Icon size={14} aria-label={f.rule} />
              </span>
            );
          })}
          {!isFrom && (
            <>
              <button
                type="button"
                aria-label={`${t("builds.blocks.up")} ${ins.keyword}`}
                title={t("builds.blocks.up")}
                disabled={!prev || prev.keyword === "FROM"}
                className="text-dim hover:text-accent disabled:opacity-30"
                onClick={() => prev && onChange(moveInstruction(text, ins, prev.spanStart))}
              >
                <ArrowUp size={14} />
              </button>
              <button
                type="button"
                aria-label={`${t("builds.blocks.down")} ${ins.keyword}`}
                title={t("builds.blocks.down")}
                disabled={!next}
                className="text-dim hover:text-accent disabled:opacity-30"
                onClick={() => next && onChange(moveInstruction(text, ins, next.endLine + 1))}
              >
                <ArrowDown size={14} />
              </button>
            </>
          )}
          <button
            type="button"
            aria-label={`${t("common.delete")} ${ins.keyword}`}
            title={t("common.delete")}
            className="text-dim hover:text-danger"
            onClick={() => onChange(removeInstruction(text, ins))}
          >
            <Trash2 size={14} />
          </button>
        </div>
        {expanded && (
          <div className="border-t border-line p-3">
            <BlockForm
              form={form}
              stages={stageNames(stageIndex ?? 0)}
              onChange={(f) => onChange(replaceInstruction(text, ins, ins.keyword, formToArgs(f)))}
            />
          </div>
        )}
      </li>
    );
  };

  const adder = (list: Instruction[], label: string) => (
    <div className="flex items-center gap-2 pt-1">
      <Plus size={14} className="text-accent" />
      <select
        aria-label={label}
        value=""
        onChange={(e) => e.target.value && add(list, e.target.value)}
        className="rounded-lg border border-line bg-bg0 px-2 py-1 text-sm text-fg"
      >
        <option value="">{t("builds.blocks.add")}…</option>
        {NEW_INSTRUCTIONS.map((n) => (
          <option key={n.keyword} value={n.keyword}>
            {n.keyword} — {t(`builds.blocks.kw.${n.keyword}`)}
          </option>
        ))}
      </select>
    </div>
  );

  // Drop target for the mouse; the move up/down buttons are the keyboard way to do the same.
  const dropAtEnd = (list: Instruction[]) => (
    // biome-ignore lint/a11y/noStaticElementInteractions: drag-and-drop target, keyboard alternative exists
    <div
      onDragOver={(e) => {
        if (dragging !== null) e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        const src = Number(e.dataTransfer.getData(MIME));
        setDragging(null);
        if (Number.isInteger(src)) move(src, endOf(list));
      }}
      className={
        dragging !== null
          ? "rounded-lg border border-dashed border-accent p-2 text-center text-xs text-dim"
          : "hidden"
      }
    >
      {t("builds.blocks.dropHere")}
    </div>
  );

  if (df.stages.length === 0 && df.preamble.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl border border-line bg-bg1 p-5">
        <h3 className="font-semibold">{t("builds.blocks.emptyTitle")}</h3>
        <p className="text-sm text-dim">{t("builds.blocks.emptyBody")}</p>
        <Button variant="primary" onClick={addStage}>
          <Plus size={14} /> {t("builds.blocks.addStage")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {stage === null && df.preamble.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-xs uppercase tracking-wider text-dim">
            {t("builds.blocks.preamble")}
          </h3>
          <ul className="flex flex-col gap-2">
            {df.preamble.map((ins) => renderBlock(ins, null))}
          </ul>
        </section>
      )}
      {df.stages
        .filter((s) => stage === null || s.index === stage)
        .map((s) => (
          <section
            key={s.index}
            className="flex flex-col gap-2"
            aria-label={s.name ?? `${t("builds.blocks.stage")} ${s.index + 1}`}
          >
            <h3 className="text-xs uppercase tracking-wider text-dim">
              {t("builds.blocks.stage")} {s.index + 1}
              {s.name && <span className="ml-2 font-mono normal-case text-accent">{s.name}</span>}
            </h3>
            <ul className="flex flex-col gap-2">
              {s.instructions.map((ins) => renderBlock(ins, s.index))}
            </ul>
            {dropAtEnd(s.instructions)}
            {adder(
              s.instructions,
              `${t("builds.blocks.add")} · ${t("builds.blocks.stage")} ${s.index + 1}`,
            )}
          </section>
        ))}
      {stage === null && (
        <Button className="w-fit" onClick={addStage}>
          <Plus size={14} /> {t("builds.blocks.addStage")}
        </Button>
      )}
    </div>
  );
}
