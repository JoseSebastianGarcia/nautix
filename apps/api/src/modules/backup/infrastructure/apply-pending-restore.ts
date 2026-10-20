import { cpSync, existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { PENDING_DIR } from "./file-backup-service.js";

/**
 * Called once at startup, before any database is opened: if a restore was staged, the current
 * state is moved to `<data>/before-restore-<time>` (kept, never deleted) and the staged files
 * take its place. Returns whether a restore was applied.
 */
export const applyPendingRestore = (dataDir: string): boolean => {
  const pending = join(dataDir, PENDING_DIR);
  if (!existsSync(join(pending, "nautix.db"))) return false;
  const keep = join(dataDir, `before-restore-${new Date().toISOString().replace(/[:.]/g, "-")}`);
  mkdirSync(keep, { recursive: true, mode: 0o700 });
  for (const name of ["nautix.db", "nautix.db-wal", "nautix.db-shm", ".key", "tls"]) {
    const from = join(dataDir, name);
    if (existsSync(from)) renameSync(from, join(keep, name));
  }
  for (const name of [".key", "nautix.db", "tls"]) {
    const from = join(pending, name);
    if (existsSync(from)) cpSync(from, join(dataDir, name), { recursive: true });
  }
  rmSync(pending, { recursive: true, force: true });
  return true;
};
