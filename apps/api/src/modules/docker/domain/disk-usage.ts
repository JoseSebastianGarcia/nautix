import type { DiskUsage } from "@nautix/contracts";

interface RawDf {
  Images?: { Size?: number; SharedSize?: number; Containers?: number }[];
  Containers?: { State?: string; SizeRw?: number }[];
  Volumes?: { UsageData?: { Size?: number; RefCount?: number } }[];
  BuildCache?: { Size?: number; InUse?: boolean; Shared?: boolean }[];
}

const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

/** Normalizes `GET /system/df` into the same buckets `docker system df` prints. */
export const summarizeDf = (raw: RawDf): DiskUsage => {
  const images = raw.Images ?? [];
  const containers = raw.Containers ?? [];
  const volumes = raw.Volumes ?? [];
  const cache = raw.BuildCache ?? [];
  const sized = (v: { UsageData?: { Size?: number } }) => Math.max(0, v.UsageData?.Size ?? 0);
  return {
    images: {
      count: images.length,
      active: images.filter((i) => (i.Containers ?? 0) > 0).length,
      sizeBytes: sum(images.map((i) => i.Size ?? 0)),
      reclaimableBytes: sum(
        images.filter((i) => (i.Containers ?? 0) === 0).map((i) => i.Size ?? 0),
      ),
    },
    containers: {
      count: containers.length,
      active: containers.filter((c) => c.State === "running").length,
      sizeBytes: sum(containers.map((c) => c.SizeRw ?? 0)),
      reclaimableBytes: sum(
        containers.filter((c) => c.State !== "running").map((c) => c.SizeRw ?? 0),
      ),
    },
    volumes: {
      count: volumes.length,
      active: volumes.filter((v) => (v.UsageData?.RefCount ?? 0) > 0).length,
      sizeBytes: sum(volumes.map(sized)),
      reclaimableBytes: sum(volumes.filter((v) => (v.UsageData?.RefCount ?? 0) === 0).map(sized)),
    },
    buildCache: {
      count: cache.length,
      active: cache.filter((c) => c.InUse).length,
      sizeBytes: sum(cache.map((c) => c.Size ?? 0)),
      reclaimableBytes: sum(cache.filter((c) => !c.InUse).map((c) => c.Size ?? 0)),
    },
  };
};
