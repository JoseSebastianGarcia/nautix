import { Copy } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useToasts } from "../../components/toast-store.js";
import { jsonPath } from "./details-utils.js";

type Json = unknown;
const isBranch = (v: Json): v is Record<string, Json> | Json[] =>
  v !== null && typeof v === "object";

/** Collapsible JSON tree; every node can copy its path (like `docker inspect -f '{{.Config.Env}}'` targets). */
export function JsonTree({ value, filter }: { value: Json; filter: string }) {
  return <Node label="" value={value} path={[]} depth={0} filter={filter.trim().toLowerCase()} />;
}

const matches = (value: Json, label: string, q: string): boolean => {
  if (!q) return true;
  if (label.toLowerCase().includes(q)) return true;
  if (!isBranch(value)) return String(value).toLowerCase().includes(q);
  return Object.entries(value).some(([k, v]) => matches(v, k, q));
};

function Node({
  label,
  value,
  path,
  depth,
  filter,
}: {
  label: string;
  value: Json;
  path: (string | number)[];
  depth: number;
  filter: string;
}) {
  const { t } = useTranslation();
  const push = useToasts((s) => s.push);
  if (!matches(value, label, filter)) return null;
  const copy = () => {
    void navigator.clipboard?.writeText(jsonPath(path));
    push("ok", t("common.copied"));
  };
  const copyButton = path.length > 0 && (
    <button
      type="button"
      aria-label={`${t("details.copyPath")} ${jsonPath(path)}`}
      title={t("details.copyPath")}
      className="ml-2 hidden text-dim hover:text-accent group-hover:inline"
      onClick={copy}
    >
      <Copy size={11} />
    </button>
  );

  if (!isBranch(value)) {
    const color =
      typeof value === "string"
        ? "text-cyan"
        : typeof value === "number"
          ? "text-amber"
          : "text-accent";
    return (
      <div className="group pl-4 font-mono text-xs">
        <span className="text-dim">{label}: </span>
        <span className={color}>{typeof value === "string" ? `"${value}"` : String(value)}</span>
        {copyButton}
      </div>
    );
  }
  const entries = Array.isArray(value)
    ? value.map((v, i) => [i, v] as const)
    : Object.entries(value);
  return (
    <details open={depth < 1 || filter !== ""} className="group pl-4 font-mono text-xs">
      <summary className="cursor-pointer select-none">
        <span className="text-fg">{label === "" ? t("details.root") : label}</span>
        <span className="text-dim">
          {" "}
          {Array.isArray(value) ? `[${entries.length}]` : `{${entries.length}}`}
        </span>
        {copyButton}
      </summary>
      {entries.map(([k, v]) => (
        <Node
          key={String(k)}
          label={String(k)}
          value={v}
          path={[...path, k]}
          depth={depth + 1}
          filter={filter}
        />
      ))}
    </details>
  );
}
