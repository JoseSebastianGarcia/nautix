import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { type Db, runMigrations } from "./db/migrations.js";
import { MIGRATIONS } from "./db/schema.js";

export type { Db } from "./db/migrations.js";

const KEEP_BACKUPS = 5;

/** A consistent copy of the database taken right before a schema upgrade, so it can be rolled back by hand. */
const backupBeforeMigrate = (db: Db, dataDir: string, fromVersion: number): void => {
  const dir = join(dataDir, "backups");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target = join(dir, `pre-migrate-from-v${fromVersion}-${stamp}.db`);
  db.prepare("VACUUM INTO ?").run(target);
  const old = readdirSync(dir)
    .filter((f) => f.startsWith("pre-migrate-") && f.endsWith(".db"))
    .sort();
  for (const f of old.slice(0, Math.max(0, old.length - KEEP_BACKUPS))) rmSync(join(dir, f));
};

/** Opens the database and brings its schema up to date (every module calls this; later calls are no-ops). */
export const openDatabase = (dataDir: string): Db => {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const path = join(dataDir, "nautix.db");
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  runMigrations(db, MIGRATIONS, {
    beforeMigrate: (from) => {
      if (existsSync(path)) backupBeforeMigrate(db, dataDir, from);
    },
    onApplied: (m) => console.log(`Nautix: database migrated to v${m.version} (${m.name})`),
  });
  return db;
};
