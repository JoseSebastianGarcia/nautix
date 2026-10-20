import type Database from "better-sqlite3";

export type Db = Database.Database;

export interface Migration {
  /** 1, 2, 3, … with no gaps. Never edit or renumber a migration that has shipped. */
  version: number;
  name: string;
  up(db: Db): void;
}

/** The database was written by a newer Nautix than this one: starting would risk corrupting it. */
export class SchemaTooNewError extends Error {
  constructor(
    readonly found: number,
    readonly supported: number,
  ) {
    super(
      `the database is at schema version ${found} but this Nautix only knows up to ${supported}; update Nautix or restore an older backup`,
    );
    this.name = "SchemaTooNewError";
  }
}

export interface MigrateOptions {
  /** Called once before the first pending migration when the database already holds data. */
  beforeMigrate?: (fromVersion: number) => void;
  onApplied?: (migration: Migration) => void;
}

const checkOrder = (migrations: readonly Migration[]): void => {
  migrations.forEach((m, i) => {
    if (m.version !== i + 1)
      throw new Error(`migration ${m.name} has version ${m.version}, expected ${i + 1}`);
  });
};

export const currentVersion = (db: Db): number => {
  const exists = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'")
    .get();
  if (!exists) return 0;
  return (
    db.prepare("SELECT COALESCE(MAX(version), 0) AS v FROM schema_migrations").get() as {
      v: number;
    }
  ).v;
};

const hasUserTables = (db: Db): boolean =>
  db
    .prepare(
      "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != 'schema_migrations' LIMIT 1",
    )
    .get() !== undefined;

/**
 * Brings the database to the latest schema. Each migration runs in its own transaction, so a
 * failure leaves the database at the last version that fully applied. Returns the versions applied.
 */
export const runMigrations = (
  db: Db,
  migrations: readonly Migration[],
  options: MigrateOptions = {},
): number[] => {
  checkOrder(migrations);
  const latest = migrations.length;
  const from = currentVersion(db);
  if (from > latest) throw new SchemaTooNewError(from, latest);
  const pending = migrations.slice(from);
  if (pending.length === 0) return [];

  if (hasUserTables(db)) options.beforeMigrate?.(from);
  db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL)",
  );
  const applied: number[] = [];
  for (const migration of pending) {
    db.transaction(() => {
      migration.up(db);
      db.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)").run(
        migration.version,
        migration.name,
        Date.now(),
      );
    })();
    applied.push(migration.version);
    options.onApplied?.(migration);
  }
  return applied;
};
