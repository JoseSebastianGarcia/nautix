import type {
  Container,
  Image,
  Network,
  PruneItem,
  PruneKind,
  PrunePreview,
  Volume,
} from "@nautix/contracts";

export interface PruneInventory {
  containers: Container[];
  images: Image[];
  volumes: Volume[];
  networks: Network[];
}

/**
 * What a prune would remove, computed from the lists before anything is deleted (the wizard shows
 * this and asks for confirmation). Mirrors the engine's rules: stopped containers; dangling images
 * (or all unused ones); unused volumes; user networks with no containers.
 */
export const previewPrune = (kind: PruneKind, inv: PruneInventory, all: boolean): PrunePreview => {
  const items: PruneItem[] = [];
  if (kind === "containers") {
    for (const c of inv.containers) {
      if (["exited", "created", "dead"].includes(c.state) && !c.isSelf)
        items.push({ kind, id: c.id, name: c.name });
    }
  } else if (kind === "images") {
    for (const i of inv.images) {
      const dangling = i.tags.length === 0;
      if (!i.inUse && (dangling || all))
        items.push({ kind, id: i.id, name: i.tags[0] ?? i.id.slice(0, 19), size: i.size });
    }
  } else if (kind === "volumes") {
    for (const v of inv.volumes) if (!v.inUse) items.push({ kind, id: v.name, name: v.name });
  } else {
    for (const n of inv.networks)
      if (!n.system && n.containerIds.length === 0) items.push({ kind, id: n.id, name: n.name });
  }
  return { items, reclaimableBytes: items.reduce((n, i) => n + (i.size ?? 0), 0) };
};
