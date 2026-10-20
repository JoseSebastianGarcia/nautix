import { Plus, X } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "../../components/ui.js";

/** Text input that commits on blur or Enter, so each edit is one undo step and one YAML patch. */
export function CommitInput({
  value,
  onCommit,
  validate,
  label,
  placeholder,
  disabled,
}: {
  value: string;
  onCommit: (value: string) => void;
  validate?: (value: string) => boolean;
  label: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const valid = validate ? draft === "" || validate(draft) : true;
  const commit = () => {
    if (draft === value) return;
    if (valid) onCommit(draft);
    else setDraft(value);
  };
  return (
    <Input
      aria-label={label}
      aria-invalid={!valid}
      disabled={disabled}
      placeholder={placeholder}
      value={draft}
      className={`w-full ${valid ? "" : "border-danger"}`}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setDraft(value);
      }}
    />
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs uppercase tracking-wider text-dim">{title}</h3>
      {children}
    </section>
  );
}

/** Editable list of strings with an "add" row. Items that fail `validate` are rejected. */
export function StringListEditor({
  label,
  items,
  onChange,
  validate,
  placeholder,
  readOnly,
  hint,
}: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  validate?: (value: string) => boolean;
  placeholder?: string;
  readOnly?: boolean;
  hint?: (item: string) => ReactNode;
}) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState("");
  const addValid = adding === "" || !validate || validate(adding);
  const add = () => {
    const value = adding.trim();
    if (!value || !addValid) return;
    onChange([...items, value]);
    setAdding("");
  };
  return (
    <Section title={label}>
      {items.map((item, i) => (
        // Position is the identity: the YAML list has no ids.
        // biome-ignore lint/suspicious/noArrayIndexKey: list items are positional
        <div key={i} className="flex flex-col gap-1">
          <div className="flex items-center gap-1">
            <CommitInput
              label={`${label} ${i + 1}`}
              value={item}
              {...(validate ? { validate } : {})}
              disabled={readOnly ?? false}
              onCommit={(v) =>
                onChange(
                  v === ""
                    ? items.filter((_, j) => j !== i)
                    : items.map((x, j) => (j === i ? v : x)),
                )
              }
            />
            {!readOnly && (
              <button
                type="button"
                aria-label={`${t("common.delete")} ${item}`}
                className="text-dim hover:text-danger"
                onClick={() => onChange(items.filter((_, j) => j !== i))}
              >
                <X size={14} />
              </button>
            )}
          </div>
          {hint?.(item)}
        </div>
      ))}
      {!readOnly && (
        <div className="flex items-center gap-1">
          <Input
            aria-label={`${label}: ${t("compose.add")}`}
            aria-invalid={!addValid}
            className={`w-full ${addValid ? "" : "border-danger"}`}
            placeholder={placeholder}
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
          />
          <button
            type="button"
            aria-label={`${label}: ${t("compose.add")}`}
            className="text-accent"
            onClick={add}
          >
            <Plus size={16} />
          </button>
        </div>
      )}
    </Section>
  );
}

export function EnvEditor({
  label,
  entries,
  onChange,
  readOnly,
}: {
  label: string;
  entries: [string, string][];
  onChange: (entries: [string, string][]) => void;
  readOnly?: boolean;
}) {
  const { t } = useTranslation();
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const add = () => {
    if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(key)) return;
    onChange([...entries.filter(([k]) => k !== key), [key, value]]);
    setKey("");
    setValue("");
  };
  return (
    <Section title={label}>
      {entries.map(([k, v], i) => (
        <div key={k} className="flex items-center gap-1">
          <span className="w-2/5 truncate font-mono text-xs" title={k}>
            {k}
          </span>
          <CommitInput
            label={`${label} ${k}`}
            value={v}
            disabled={readOnly ?? false}
            onCommit={(next) => onChange(entries.map((e, j) => (j === i ? [k, next] : e)))}
          />
          {!readOnly && (
            <button
              type="button"
              aria-label={`${t("common.delete")} ${k}`}
              className="text-dim hover:text-danger"
              onClick={() => onChange(entries.filter((_, j) => j !== i))}
            >
              <X size={14} />
            </button>
          )}
        </div>
      ))}
      {!readOnly && (
        <div className="flex items-center gap-1">
          <Input
            aria-label={`${label}: KEY`}
            className="w-2/5"
            placeholder="KEY"
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
          <Input
            aria-label={`${label}: value`}
            className="w-full"
            placeholder="value"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
          />
          <button
            type="button"
            aria-label={`${label}: ${t("compose.add")}`}
            className="text-accent"
            onClick={add}
          >
            <Plus size={16} />
          </button>
        </div>
      )}
    </Section>
  );
}

/** Checkbox group over a known set of names (networks, dependencies). */
export function CheckList({
  label,
  options,
  selected,
  onChange,
  readOnly,
  empty,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  readOnly?: boolean;
  empty: string;
}) {
  return (
    <Section title={label}>
      {options.length === 0 && <p className="text-sm text-dim">{empty}</p>}
      {options.map((o) => (
        <label key={o} className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            disabled={readOnly ?? false}
            checked={selected.includes(o)}
            onChange={(e) =>
              onChange(e.target.checked ? [...selected, o] : selected.filter((s) => s !== o))
            }
          />
          <span className="font-mono">{o}</span>
        </label>
      ))}
    </Section>
  );
}
