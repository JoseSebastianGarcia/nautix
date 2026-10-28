import type { PruneKind } from "@nautix/contracts";

/** Something the person ticked, or the cleanup preview offers, to delete. */
export interface BulkItem {
  kind: PruneKind;
  /** What the remove endpoint takes: the id, or the name for a volume. */
  id: string;
  name: string;
  size?: number;
  /** A running container is stopped by force when it is removed. */
  running?: boolean;
}

/** Containers go first so the networks, images and volumes they held are free when their turn comes. */
export const BULK_ORDER: readonly PruneKind[] = ["containers", "networks", "images", "volumes"];

export const orderForRemoval = (items: readonly BulkItem[]): BulkItem[] =>
  [...items].sort((a, b) => BULK_ORDER.indexOf(a.kind) - BULK_ORDER.indexOf(b.kind));

export interface BulkOutcome {
  removed: BulkItem[];
  failed: { item: BulkItem; reason: string }[];
}

/**
 * Removes the items one by one, in the safe order. A failure never stops the rest: it is reported with
 * the engine's own reason. `onProgress` gets the number of items handled so far.
 */
export const removeAll = async (
  items: readonly BulkItem[],
  remove: (item: BulkItem) => Promise<unknown>,
  onProgress?: (done: number) => void,
): Promise<BulkOutcome> => {
  const outcome: BulkOutcome = { removed: [], failed: [] };
  let done = 0;
  for (const item of orderForRemoval(items)) {
    try {
      await remove(item);
      outcome.removed.push(item);
    } catch (error) {
      outcome.failed.push({
        item,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
    done += 1;
    onProgress?.(done);
  }
  return outcome;
};

/** The docker lines that do the same as the selection, one per kind, for *Show command*. */
export const bulkCommands = (items: readonly BulkItem[]): string[] => {
  const names = (kind: PruneKind) =>
    items
      .filter((i) => i.kind === kind)
      .map((i) => i.name)
      .join(" ");
  const forced = items.some((i) => i.kind === "containers" && i.running);
  const lines: [PruneKind, string][] = [
    ["containers", `docker rm${forced ? " -f" : ""}`],
    ["networks", "docker network rm"],
    ["images", "docker rmi"],
    ["volumes", "docker volume rm"],
  ];
  return lines.flatMap(([kind, prefix]) => (names(kind) ? [`${prefix} ${names(kind)}`] : []));
};

/** `docker system prune`: `-a` also takes unused images, `--volumes` the unused volumes (they hold data). */
export const systemPruneCommand = (opts: { images: boolean; volumes: boolean }): string =>
  ["docker system prune", opts.images ? "-a" : "", opts.volumes ? "--volumes" : ""]
    .filter(Boolean)
    .join(" ");

export const toggled = (selected: ReadonlySet<string>, key: string): Set<string> => {
  const next = new Set(selected);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
};

/** Ticks every key; when they all are ticked already it clears them (the header checkbox). */
export const selectAll = (
  allKeys: readonly string[],
  selected: ReadonlySet<string>,
): Set<string> => (allKeys.every((k) => selected.has(k)) ? new Set() : new Set(allKeys));
