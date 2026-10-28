import type { PruneItem, PruneKind } from "@nautix/contracts";
import { useQueries } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../app/api.js";
import { BULK_ORDER, type BulkItem, bulkCommands, systemPruneCommand } from "../../app/bulk.js";
import { keys } from "../../app/queries.js";
import { useBulkDelete } from "../../components/bulk-delete.js";
import { Button, ConfirmDialog, ShowCommand } from "../../components/ui.js";
import { Card } from "../containers/panels.js";
import { formatBytes } from "../resources/format.js";

const itemKey = (i: BulkItem) => `${i.kind}:${i.id}`;

const toBulk = (item: PruneItem): BulkItem => ({
  kind: item.kind,
  id: item.id ?? item.name,
  name: item.name,
  ...(item.size !== undefined ? { size: item.size } : {}),
});

/** `docker system prune`, but selective: every unused thing in one list, each with its own checkbox. */
export function CleanupAll() {
  const { t } = useTranslation();
  const [images, setImages] = useState(false);
  const [volumes, setVolumes] = useState(false);
  const [off, setOff] = useState<ReadonlySet<string>>(new Set());
  const [confirm, setConfirm] = useState(false);

  const kinds = BULK_ORDER.filter((k) => (k === "volumes" ? volumes : true));
  const previews = useQueries({
    queries: kinds.map((kind) => ({
      queryKey: ["prune-preview", kind, kind === "images" ? images : kind === "volumes"],
      queryFn: () => api.prunePreview(kind, kind === "images" ? images : kind === "volumes"),
    })),
  });
  const loading = previews.some((p) => p.isLoading);
  const all: BulkItem[] = previews.flatMap((p) => (p.data?.items ?? []).map(toBulk));
  const chosen = all.filter((i) => !off.has(itemKey(i)));
  const reclaim = chosen.reduce((n, i) => n + (i.size ?? 0), 0);
  const command =
    off.size === 0
      ? systemPruneCommand({ images, volumes })
      : bulkCommands(chosen).join("\n") || systemPruneCommand({ images, volumes });

  const { run, running } = useBulkDelete(
    [keys.containers, keys.images, keys.volumes, keys.networks, ["system-df"], ["prune-preview"]],
    () => setOff(new Set()),
  );

  const setGroup = (kind: PruneKind, on: boolean) => {
    const next = new Set(off);
    for (const i of all.filter((x) => x.kind === kind)) {
      if (on) next.delete(itemKey(i));
      else next.add(itemKey(i));
    }
    setOff(next);
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-dim">{t("system.cleanupIntro")}</p>
      <div className="flex flex-col gap-1 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={images} onChange={(e) => setImages(e.target.checked)} />
          {t("system.allImages")}
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={volumes} onChange={(e) => setVolumes(e.target.checked)} />
          {t("system.cleanupVolumes")}
        </label>
        {volumes && <p className="text-xs text-amber">{t("system.cleanupVolumesWarn")}</p>}
      </div>
      <Card title={t("system.willBeRemoved", { count: chosen.length })}>
        {loading ? (
          <p className="text-sm text-dim">{t("common.loading")}</p>
        ) : all.length === 0 ? (
          <p className="text-sm text-dim">{t("system.nothingToPrune")}</p>
        ) : (
          <div className="flex flex-col gap-3">
            {kinds.map((kind) => {
              const group = all.filter((i) => i.kind === kind);
              if (group.length === 0) return null;
              const ticked = group.filter((i) => !off.has(itemKey(i))).length;
              return (
                <section key={kind} className="flex flex-col gap-1">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      aria-label={t("system.groupToggle", { kind: t(`system.bucket.${kind}`) })}
                      checked={ticked === group.length}
                      ref={(el) => {
                        if (el) el.indeterminate = ticked > 0 && ticked < group.length;
                      }}
                      onChange={(e) => setGroup(kind, e.target.checked)}
                    />
                    {t(`system.bucket.${kind}`)}{" "}
                    <span className="text-dim">
                      ({ticked}/{group.length})
                    </span>
                  </label>
                  <ul className="max-h-48 overflow-auto font-mono text-xs">
                    {group.map((i) => (
                      <li key={itemKey(i)} className="border-b border-line py-1">
                        <label className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              aria-label={t("bulk.selectRow", { name: i.name })}
                              checked={!off.has(itemKey(i))}
                              onChange={() => {
                                const next = new Set(off);
                                if (next.has(itemKey(i))) next.delete(itemKey(i));
                                else next.add(itemKey(i));
                                setOff(next);
                              }}
                            />
                            {i.name}
                          </span>
                          {i.size !== undefined && (
                            <span className="text-dim">{formatBytes(i.size)}</span>
                          )}
                        </label>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
        {reclaim > 0 && (
          <p className="mt-2 text-sm text-amber">
            {t("system.reclaims", { size: formatBytes(reclaim) })}
          </p>
        )}
      </Card>
      <p className="text-xs text-dim">{t("system.cleanupNoCache")}</p>
      <ShowCommand command={command} />
      <div>
        <Button
          write
          variant="danger"
          disabled={chosen.length === 0 || running}
          onClick={() => setConfirm(true)}
        >
          <Trash2 size={14} /> {t("bulk.deleteSelected")} ({chosen.length})
        </Button>
      </div>
      <ConfirmDialog
        open={confirm}
        title={t("bulk.confirmTitle", { count: chosen.length })}
        body={t("system.confirmBody", { count: chosen.length })}
        command={command}
        confirmLabel={t("common.delete")}
        requireText={String(chosen.length)}
        onConfirm={() => void run(chosen)}
        onClose={() => setConfirm(false)}
      />
    </div>
  );
}
