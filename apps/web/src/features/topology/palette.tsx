import type { Template } from "@nautix/contracts";
import { Network as NetworkIcon, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useCatalog, useIsAdmin } from "../../app/queries.js";
import { Button } from "../../components/ui.js";
import { LogoBadge } from "./logo-badge.js";

export const DRAG_TYPE = "application/x-nautix-template";

/** Sentinel for the free-form "any image" entry. */
export const CUSTOM_TEMPLATE_ID = "custom";

export function Palette({
  onNewNetwork,
  onPick,
}: {
  onNewNetwork: () => void;
  onPick: (t: Template | "custom") => void;
}) {
  const { t } = useTranslation();
  const { data } = useCatalog();
  const isAdmin = useIsAdmin();
  const groups = new Map<string, Template[]>();
  for (const tpl of data ?? [])
    groups.set(tpl.category, [...(groups.get(tpl.category) ?? []), tpl]);

  return (
    <aside
      className="flex w-64 shrink-0 flex-col gap-4 overflow-y-auto border-r border-line bg-bg1 p-4"
      aria-label={t("topology.paletteTitle")}
    >
      <div>
        <h2 className="font-mono text-xs uppercase tracking-wider text-dim">
          {t("topology.paletteTitle")}
        </h2>
        <p className="mt-1 text-xs text-dim">{t("topology.paletteHint")}</p>
      </div>
      <Button write variant="primary" onClick={onNewNetwork}>
        <NetworkIcon size={14} /> {t("topology.newNetwork")}
      </Button>
      {[...groups.entries()].map(([category, items]) => (
        <section key={category} className="flex flex-col gap-2">
          <h3 className="font-mono text-[11px] uppercase tracking-wider text-dim">{category}</h3>
          {items.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              draggable={isAdmin}
              disabled={!isAdmin}
              onDragStart={(e) => e.dataTransfer.setData(DRAG_TYPE, tpl.id)}
              onClick={() => onPick(tpl)}
              className="flex items-center gap-3 rounded-xl border border-line bg-bg0 p-2 text-left hover:border-accent"
            >
              <LogoBadge image={tpl.image} name={tpl.name} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{tpl.name}</span>
                <span className="block truncate text-[11px] text-dim">{tpl.description}</span>
              </span>
            </button>
          ))}
        </section>
      ))}
      <button
        type="button"
        draggable={isAdmin}
        disabled={!isAdmin}
        onDragStart={(e) => e.dataTransfer.setData(DRAG_TYPE, CUSTOM_TEMPLATE_ID)}
        onClick={() => onPick("custom")}
        className="flex items-center gap-3 rounded-xl border border-dashed border-line p-2 text-left hover:border-accent"
      >
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-accent-soft text-accent">
          <Plus size={18} />
        </span>
        <span className="text-sm font-semibold">{t("common.image")}</span>
      </button>
    </aside>
  );
}
