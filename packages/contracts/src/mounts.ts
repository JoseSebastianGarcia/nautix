import { z } from "zod";

/** Ways a bind mount reaches the host that deserve an explicit yes (ADR-058). */
export const MountRisk = z.enum(["docker-socket", "host-root", "sensitive-path"]);
export type MountRisk = z.infer<typeof MountRisk>;

/** Stable display order: the most serious first. */
const ORDER: readonly MountRisk[] = ["docker-socket", "host-root", "sensitive-path"];

const DRIVE = /^[A-Za-z]:[\\/]/;
const PIPE = /^\\\\[.?]\\pipe\\/i;

/** An absolute path on the host: POSIX, a Windows drive, or a Windows named pipe. */
export const isHostPath = (path: string): boolean =>
  path.startsWith("/") || DRIVE.test(path) || PIPE.test(path);

/** An absolute path inside the container. */
export const isContainerPath = (path: string): boolean => path.startsWith("/");

export const BindMount = z.object({
  source: z.string().min(1).max(1024).refine(isHostPath, "must be an absolute host path"),
  target: z.string().min(1).max(1024).refine(isContainerPath, "must start with /"),
  readOnly: z.boolean().default(false),
});
export type BindMount = z.infer<typeof BindMount>;

/** `/host:/container[:ro]` — what Docker's `Binds` takes. */
export const bindString = (m: { source: string; target: string; readOnly?: boolean }): string =>
  `${m.source}:${m.target}${m.readOnly ? ":ro" : ""}`;

/** Reads a bind string back; null when it is a bare name or empty. A drive letter stays in the source. */
export const parseBind = (
  bind: string,
): { source: string; target: string; readOnly: boolean } | null => {
  const drive = DRIVE.test(bind) ? 2 : 0;
  const first = bind.indexOf(":", drive);
  if (first <= 0) return null;
  const source = bind.slice(0, first);
  const rest = bind.slice(first + 1);
  const [target, ...options] = rest.split(":");
  if (!target) return null;
  return { source, target, readOnly: options.includes("ro") };
};

/** Collapses `//`, `.` and `..` so `/var/run/../run//docker.sock` is seen for what it is. */
const normalize = (path: string): string => {
  const parts: string[] = [];
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return `/${parts.join("/")}`;
};

const SENSITIVE = ["/etc", "/root", "/boot", "/proc", "/sys", "/dev", "/var/lib/docker"];
const SOCKET_DIRS = ["/var/run", "/run"];

const isUnder = (path: string, root: string): boolean =>
  path === root || path.startsWith(`${root}/`);

const risksOf = (source: string): MountRisk[] => {
  if (PIPE.test(source)) return source.toLowerCase().includes("docker") ? ["docker-socket"] : [];
  if (/^[A-Za-z]:[\\/]?$/.test(source)) return ["host-root"];
  if (!source.startsWith("/")) return [];
  const path = normalize(source);
  const found: MountRisk[] = [];
  if (path === "/") found.push("host-root");
  // The socket itself, or a folder that contains it (/var/run, /run, /var, ...).
  if (
    path === "/" ||
    path.endsWith("/docker.sock") ||
    SOCKET_DIRS.some((dir) => isUnder(dir, path))
  )
    found.push("docker-socket");
  // A parent of a sensitive folder exposes it too (/var/lib contains /var/lib/docker).
  if (SENSITIVE.some((root) => isUnder(path, root) || isUnder(root, path)))
    found.push("sensitive-path");
  return found;
};

/** The risks carried by a list of bind strings (named volumes carry none). Each risk once, most serious first. */
export const mountRisks = (binds: readonly string[]): MountRisk[] => {
  const found = new Set<MountRisk>();
  for (const bind of binds) {
    const parsed = parseBind(bind);
    if (parsed) for (const risk of risksOf(parsed.source)) found.add(risk);
  }
  return ORDER.filter((risk) => found.has(risk));
};

/** The risks in `binds` that the caller did not accept. Empty means the request may go ahead. */
export const missingConsent = (
  binds: readonly string[],
  accepted: readonly MountRisk[],
): MountRisk[] => mountRisks(binds).filter((risk) => !accepted.includes(risk));
