import type { Command, Form, Pair } from "@nautix/dockerfile";
import { Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { StringListEditor } from "../../components/fields.js";
import { Field, Input } from "../../components/ui.js";

/**
 * A field that keeps what the user typed (spaces included) even though the model underneath is
 * re-parsed and trimmed after every keystroke; it only adopts the model's value when it changed from outside.
 */
function useDraft(value: string, onChange: (v: string) => void) {
  const [draft, setDraft] = useState(value);
  const last = useRef(value);
  useEffect(() => {
    if (value.trim() !== last.current.trim()) {
      last.current = value;
      setDraft(value);
    }
  }, [value]);
  return {
    value: draft,
    set: (v: string) => {
      last.current = v;
      setDraft(v);
      onChange(v);
    },
  };
}

function Text({
  label,
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
}) {
  const d = useDraft(value, onChange);
  return (
    <Field label={label} {...(hint ? { hint } : {})}>
      <Input value={d.value} placeholder={placeholder} onChange={(e) => d.set(e.target.value)} />
    </Field>
  );
}

function Area({
  label,
  value,
  onChange,
  hint,
  rows = 4,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  rows?: number;
}) {
  const d = useDraft(value, onChange);
  return (
    <Field label={label} {...(hint ? { hint } : {})}>
      <textarea
        rows={rows}
        spellCheck={false}
        className="rounded-lg border border-line bg-bg0 p-2 font-mono text-sm text-fg"
        value={d.value}
        onChange={(e) => d.set(e.target.value)}
      />
    </Field>
  );
}

function CommandEditor({
  label,
  command,
  onChange,
  warnShell = false,
}: {
  label: string;
  command: Command;
  onChange: (c: Command) => void;
  /** Shell form stops the app from receiving stop signals (true for CMD / ENTRYPOINT only). */
  warnShell?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-dim">{label}</span>
        <select
          aria-label={t("builds.blocks.mode")}
          value={command.mode}
          onChange={(e) =>
            onChange(
              e.target.value === "exec"
                ? {
                    mode: "exec",
                    exec:
                      command.mode === "shell"
                        ? command.shell.split(/\s+/).filter(Boolean)
                        : command.exec,
                  }
                : {
                    mode: "shell",
                    shell: command.mode === "exec" ? command.exec.join(" ") : command.shell,
                  },
            )
          }
          className="rounded-lg border border-line bg-bg0 px-2 py-1 text-xs text-fg"
        >
          <option value="exec">{t("builds.blocks.modeExec")}</option>
          <option value="shell">{t("builds.blocks.modeShell")}</option>
        </select>
      </div>
      {command.mode === "exec" ? (
        <StringListEditor
          label={t("builds.blocks.arguments")}
          items={command.exec}
          placeholder="--flag"
          onChange={(exec) => onChange({ mode: "exec", exec })}
        />
      ) : (
        <Text
          label={t("builds.blocks.shellLine")}
          value={command.shell}
          onChange={(shell) => onChange({ mode: "shell", shell })}
        />
      )}
      {warnShell && command.mode === "shell" && (
        <p className="text-xs text-amber">{t("builds.rules.NX-DF013", { keyword: label })}</p>
      )}
    </div>
  );
}

function PairsEditor({
  pairs,
  nullable,
  onChange,
}: {
  pairs: Pair[];
  /** ARG: an empty value means "no default". */
  nullable: boolean;
  onChange: (p: Pair[]) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2">
      {pairs.map((p, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional
        <div key={i} className="flex items-center gap-2">
          <PairInput
            label={t("builds.blocks.key")}
            value={p.key}
            onChange={(key) => onChange(pairs.map((x, j) => (j === i ? { ...x, key } : x)))}
          />
          <span className="text-dim">=</span>
          <PairInput
            label={t("builds.blocks.value")}
            value={p.value ?? ""}
            onChange={(v) =>
              onChange(
                pairs.map((x, j) =>
                  j === i ? { ...x, value: nullable && v === "" ? null : v } : x,
                ),
              )
            }
          />
          <button
            type="button"
            aria-label={`${t("common.delete")} ${p.key}`}
            className="text-dim hover:text-danger"
            onClick={() => onChange(pairs.filter((_, j) => j !== i))}
          >
            <X size={14} />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="flex w-fit items-center gap-1 text-sm text-accent"
        onClick={() => onChange([...pairs, { key: "", value: nullable ? null : "" }])}
      >
        <Plus size={14} /> {t("builds.blocks.addPair")}
      </button>
    </div>
  );
}

function PairInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const d = useDraft(value, onChange);
  return (
    <Input
      aria-label={label}
      placeholder={label}
      value={d.value}
      onChange={(e) => d.set(e.target.value)}
    />
  );
}

export function BlockForm({
  keyword,
  form,
  stages,
  onChange,
}: {
  keyword: string;
  form: Form;
  /** Names of the earlier stages, offered for `COPY --from`. */
  stages: string[];
  onChange: (f: Form) => void;
}) {
  const { t } = useTranslation();
  const b = (k: string) => t(`builds.blocks.${k}`);
  switch (form.type) {
    case "from":
      return (
        <div className="grid gap-3 sm:grid-cols-3">
          <Text
            label={b("image")}
            value={form.image}
            onChange={(image) => onChange({ ...form, image })}
            placeholder="node:22-alpine"
          />
          <Text
            label={b("stageName")}
            value={form.as}
            onChange={(as) => onChange({ ...form, as })}
            placeholder="build"
          />
          <Text
            label={b("platform")}
            value={form.platform}
            onChange={(platform) => onChange({ ...form, platform })}
            placeholder="linux/amd64"
          />
        </div>
      );
    case "run":
      return (
        <div className="flex flex-col gap-3">
          <Area
            label={b("command")}
            value={form.command}
            rows={4}
            onChange={(command) => onChange({ ...form, command })}
            hint={b("commandHint")}
          />
          <Text
            label={b("options")}
            value={form.flags.join(" ")}
            placeholder="--mount=type=cache,target=/root/.cache"
            onChange={(v) => onChange({ ...form, flags: v.split(/\s+/).filter(Boolean) })}
          />
        </div>
      );
    case "copy":
      if (form.raw !== null) {
        return (
          <Text
            label={b("rawArgs")}
            value={form.raw}
            onChange={(raw) => onChange({ ...form, raw })}
          />
        );
      }
      return (
        <div className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={b("fromStage")}>
              <FromStage
                value={form.from}
                stages={stages}
                onChange={(from) => onChange({ ...form, from })}
              />
            </Field>
            <Text
              label="--chown"
              value={form.chown}
              onChange={(chown) => onChange({ ...form, chown })}
              placeholder="app:app"
            />
            <Text
              label="--chmod"
              value={form.chmod}
              onChange={(chmod) => onChange({ ...form, chmod })}
              placeholder="755"
            />
          </div>
          <StringListEditor
            label={b("sources")}
            items={form.sources}
            placeholder="."
            onChange={(sources) => onChange({ ...form, sources })}
          />
          <Text
            label={b("destination")}
            value={form.dest}
            onChange={(dest) => onChange({ ...form, dest })}
            placeholder="/app/"
          />
        </div>
      );
    case "pairs":
      return (
        <PairsEditor
          pairs={form.pairs}
          nullable={false}
          onChange={(pairs) => onChange({ ...form, pairs })}
        />
      );
    case "expose":
      return (
        <StringListEditor
          label={b("ports")}
          items={form.ports}
          placeholder="8080/tcp"
          validate={(v) => /^\d{1,5}(-\d{1,5})?(\/(tcp|udp))?$/.test(v)}
          onChange={(ports) => onChange({ ...form, ports })}
        />
      );
    case "single":
      return (
        <Text
          label={b("value")}
          value={form.value}
          onChange={(value) => onChange({ ...form, value })}
        />
      );
    case "list":
      return (
        <StringListEditor
          label={b("paths")}
          items={form.items}
          placeholder="/data"
          onChange={(items) => onChange({ ...form, items })}
        />
      );
    case "command":
      return (
        <CommandEditor
          label={keyword}
          command={form.command}
          warnShell
          onChange={(command) => onChange({ ...form, command })}
        />
      );
    case "healthcheck":
      return (
        <div className="flex flex-col gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.none}
              onChange={(e) => onChange({ ...form, none: e.target.checked })}
            />
            {b("healthNone")}
          </label>
          {!form.none && (
            <>
              <div className="grid gap-3 sm:grid-cols-4">
                <Text
                  label="--interval"
                  value={form.interval}
                  onChange={(interval) => onChange({ ...form, interval })}
                  placeholder="30s"
                />
                <Text
                  label="--timeout"
                  value={form.timeout}
                  onChange={(timeout) => onChange({ ...form, timeout })}
                  placeholder="5s"
                />
                <Text
                  label="--start-period"
                  value={form.startPeriod}
                  onChange={(startPeriod) => onChange({ ...form, startPeriod })}
                  placeholder="10s"
                />
                <Text
                  label="--retries"
                  value={form.retries}
                  onChange={(retries) => onChange({ ...form, retries })}
                  placeholder="3"
                />
              </div>
              <CommandEditor
                label="CMD"
                command={form.command}
                onChange={(command) => onChange({ ...form, command })}
              />
            </>
          )}
        </div>
      );
    case "raw":
      return (
        <Area
          label={b("rawArgs")}
          value={form.text}
          rows={2}
          onChange={(text) => onChange({ type: "raw", text })}
        />
      );
  }
}

function FromStage({
  value,
  stages,
  onChange,
}: {
  value: string;
  stages: string[];
  onChange: (v: string) => void;
}) {
  const { t } = useTranslation();
  const listed = value === "" || stages.includes(value);
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-line bg-bg0 px-2 py-2 text-sm text-fg"
    >
      <option value="">{t("builds.blocks.fromContext")}</option>
      {stages.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
      {!listed && <option value={value}>{value}</option>}
    </select>
  );
}
