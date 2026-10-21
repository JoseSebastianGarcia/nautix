import { posix } from "node:path";
import type { VolumeEntry } from "@nautix/contracts";
import { ValidationError } from "../../../shared/domain-error.js";

export const VOLUME_HELPER_IMAGE = "alpine:3.20";
export const VOLUME_MOUNT = "/v";
export const MAX_VIEW_BYTES = 1024 * 1024;

/** Path inside the volume (always starts with `/`, never leaves it). */
export const cleanVolumePath = (input: string): string => {
  if (input.includes("\0") || input.split("/").includes(".."))
    throw new ValidationError("invalid path", "errors.invalidPath");
  const normalised = posix.normalize(`/${input}`);
  return normalised.length > 1 ? normalised.replace(/\/$/, "") : "/";
};

/** Where that path lives inside the helper container. */
export const mountedPath = (volumePath: string): string =>
  volumePath === "/" ? VOLUME_MOUNT : `${VOLUME_MOUNT}${volumePath}`;

const KIND: Record<string, VolumeEntry["kind"]> = { d: "dir", "-": "file", l: "link" };
const LINE =
  /^([-dlcbps])([rwxsStT-]{9})\s+\d+\s+\S+\s+\S+\s+(\d+)\s+(\w{3}\s+\d+\s+[\d:]+)\s+(.+)$/;

/** Parses busybox `ls -lAp` output. Directories first, then by name. */
export const parseLs = (output: string): VolumeEntry[] => {
  const entries: VolumeEntry[] = [];
  for (const line of output.split("\n")) {
    const m = LINE.exec(line);
    if (!m) continue;
    const [, type = "-", perms = "", size = "0", modified = "", rawName = ""] = m;
    const name = rawName.replace(/ -> .*$/, "").replace(/\/$/, "");
    entries.push({
      name,
      kind: KIND[type] ?? "other",
      size: Number(size),
      modified,
      mode: `${type}${perms}`,
    });
  }
  const rank = (e: VolumeEntry): number => (e.kind === "dir" ? 0 : 1);
  return entries.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
};

/** Names of the named volumes in the `Mounts` of an inspected container. */
export const volumeNamesIn = (inspected: unknown): string[] => {
  const mounts = (inspected as { Mounts?: { Type?: string; Name?: string }[] } | null)?.Mounts;
  return (mounts ?? []).flatMap((m) => (m.Type === "volume" && m.Name ? [m.Name] : []));
};
