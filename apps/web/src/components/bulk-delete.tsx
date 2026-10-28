import type { QueryKey } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, api } from "../app/api.js";
import { type BulkItem, bulkCommands, removeAll } from "../app/bulk.js";
import { useToasts } from "./toast-store.js";
import { Button, ConfirmDialog } from "./ui.js";

/** Removes one item through the same endpoints the per-row buttons use. */
export const removeItem = (item: BulkItem): Promise<unknown> => {
  switch (item.kind) {
    case "containers":
      return api.removeContainer(item.id, true);
    case "networks":
      return api.removeNetwork(item.id);
    case "images":
      return api.removeImage(item.id, false);
    case "volumes":
      return api.removeVolume(item.id);
  }
};

const reasonOf = (error: unknown): string =>
  error instanceof ApiError ? (error.detail ?? error.code) : String(error);

/** Runs the bulk delete with a toast for progress and another for the result. */
export function useBulkDelete(invalidate: QueryKey[], onDone: () => void) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const push = useToasts((s) => s.push);
  const dismiss = useToasts((s) => s.dismiss);
  const [running, setRunning] = useState(false);
  const run = async (items: BulkItem[]) => {
    setRunning(true);
    const pending = push("pending", t("bulk.removing", { count: items.length }));
    try {
      const outcome = await removeAll(items, (it) =>
        removeItem(it).catch((e) => {
          throw new Error(reasonOf(e));
        }),
      );
      dismiss(pending);
      if (outcome.failed.length === 0)
        push("ok", t("bulk.removed", { count: outcome.removed.length }));
      else
        push(
          "error",
          t("bulk.partial", {
            removed: outcome.removed.length,
            failed: outcome.failed.length,
            first: `${outcome.failed[0]?.item.name}: ${outcome.failed[0]?.reason}`,
          }),
        );
    } finally {
      for (const queryKey of invalidate) void qc.invalidateQueries({ queryKey });
      setRunning(false);
      onDone();
    }
  };
  return { run, running };
}

/** "N selected · Delete selected": asks to type the number of items before it does anything. */
export function BulkDeleteBar({
  items,
  invalidate,
  onDone,
  onClear,
}: {
  items: BulkItem[];
  invalidate: QueryKey[];
  onDone: () => void;
  onClear: () => void;
}) {
  const { t } = useTranslation();
  const [confirm, setConfirm] = useState(false);
  const { run, running } = useBulkDelete(invalidate, onDone);
  if (items.length === 0) return null;
  const shown = items
    .slice(0, 8)
    .map((i) => i.name)
    .join(", ");
  const more = items.length > 8 ? t("bulk.andMore", { count: items.length - 8 }) : "";
  const forced = items.filter((i) => i.kind === "containers" && i.running).length;
  return (
    <div
      role="status"
      className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-bg1 px-4 py-2 text-sm"
    >
      <span>{t("bulk.selected", { count: items.length })}</span>
      <Button write variant="danger" disabled={running} onClick={() => setConfirm(true)}>
        <Trash2 size={14} /> {t("bulk.deleteSelected")}
      </Button>
      <Button onClick={onClear}>{t("bulk.clear")}</Button>
      <ConfirmDialog
        open={confirm}
        title={t("bulk.confirmTitle", { count: items.length })}
        body={`${t("bulk.confirmBody", { names: `${shown}${more}` })}${forced > 0 ? ` ${t("bulk.forced", { count: forced })}` : ""}`}
        command={bulkCommands(items).join("\n")}
        confirmLabel={t("common.delete")}
        requireText={String(items.length)}
        onConfirm={() => void run(items)}
        onClose={() => setConfirm(false)}
      />
    </div>
  );
}
