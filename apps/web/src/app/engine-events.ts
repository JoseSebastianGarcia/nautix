import type { QueryKey } from "@tanstack/react-query";

export type EngineEventKind = "container" | "network" | "image" | "volume";

const KEYS = {
  containers: ["containers"],
  networks: ["networks"],
  images: ["images"],
  volumes: ["volumes"],
  engine: ["engine"],
} as const;

/** Which cached queries a change of this kind makes stale. */
export const keysFor = (kind: EngineEventKind): QueryKey[] => {
  switch (kind) {
    case "container":
      return [KEYS.containers, KEYS.networks, KEYS.engine, KEYS.images, KEYS.volumes];
    case "network":
      return [KEYS.networks, KEYS.containers];
    case "image":
      return [KEYS.images, KEYS.engine];
    case "volume":
      return [KEYS.volumes];
  }
};

/** Collects event kinds and flushes them once per window, so a burst triggers one refetch. */
export const createCoalescer = (flush: (kinds: Set<EngineEventKind>) => void, windowMs = 150) => {
  let pending = new Set<EngineEventKind>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    push(kind: EngineEventKind) {
      pending.add(kind);
      timer ??= setTimeout(() => {
        const batch = pending;
        pending = new Set();
        timer = undefined;
        flush(batch);
      }, windowMs);
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = undefined;
      pending = new Set();
    },
  };
};
