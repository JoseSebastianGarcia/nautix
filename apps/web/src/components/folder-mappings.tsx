import { mountRisks } from "@nautix/contracts";
import { Plus, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  emptyMount,
  type MountRow,
  mountBinds,
  mountProblems,
} from "../features/topology/deploy.js";
import { Button, Input } from "./ui.js";

/** The *Mounted folders* list: host folder → folder in the container, optionally read-only. */
export function FolderMappings({
  rows,
  onChange,
}: {
  rows: MountRow[];
  onChange: (rows: MountRow[]) => void;
}) {
  const { t } = useTranslation();
  const patch = (i: number, change: Partial<MountRow>) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, ...change } : r)));
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs uppercase tracking-wider text-dim">{t("mounts.title")}</h3>
      <p className="text-xs text-dim">{t("mounts.hint")}</p>
      {rows.map((row, i) => {
        const problem = mountProblems(row);
        const risks = mountRisks(mountBinds([row]));
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional drafts
          <div key={i} className="flex flex-col gap-1 rounded-lg border border-line p-2">
            <div className="flex items-center gap-2">
              <Input
                className="min-w-0 font-mono"
                aria-label={t("mounts.source")}
                aria-invalid={problem === "source"}
                placeholder="/srv/data"
                value={row.source}
                onChange={(e) => patch(i, { source: e.target.value })}
              />
              <span className="text-dim">:</span>
              <Input
                className="min-w-0 font-mono"
                aria-label={t("mounts.target")}
                aria-invalid={problem === "target"}
                placeholder="/data"
                value={row.target}
                onChange={(e) => patch(i, { target: e.target.value })}
              />
              <label className="flex shrink-0 items-center gap-1 text-xs text-dim">
                <input
                  type="checkbox"
                  checked={row.readOnly}
                  onChange={(e) => patch(i, { readOnly: e.target.checked })}
                />
                {t("mounts.readOnly")}
              </label>
              <button
                type="button"
                aria-label={t("mounts.remove")}
                className="text-dim hover:text-danger"
                onClick={() => onChange(rows.filter((_, j) => j !== i))}
              >
                <X size={14} />
              </button>
            </div>
            {problem && <p className="text-xs text-danger">{t(`mounts.invalid.${problem}`)}</p>}
            {risks.length > 0 && (
              <p className="text-xs text-amber">
                {risks.map((r) => t(`mounts.risk.${r}.name`)).join(" · ")}
              </p>
            )}
          </div>
        );
      })}
      <Button onClick={() => onChange([...rows, emptyMount()])}>
        <Plus size={14} /> {t("mounts.add")}
      </Button>
    </section>
  );
}
