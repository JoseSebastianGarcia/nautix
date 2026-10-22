import type { Db, Migration } from "./migrations.js";

/**
 * The schema, in order. To change it, append a migration (next version number): never edit one that
 * has shipped. Each `up` must work on any database that reached the previous version.
 */
export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: "baseline",
    // Everything that existed before migrations were introduced. `IF NOT EXISTS` makes it a no-op on
    // installs created by earlier versions, which then simply start counting from here.
    up(db: Db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          username TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'admin'
        );
        CREATE TABLE IF NOT EXISTS sessions (
          token_hash TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          username TEXT NOT NULL,
          expires_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS api_tokens (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          role TEXT NOT NULL,
          token_hash TEXT NOT NULL UNIQUE,
          created_at INTEGER NOT NULL,
          last_used_at INTEGER
        );
        CREATE TABLE IF NOT EXISTS layout (id INTEGER PRIMARY KEY CHECK (id = 1), json TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS custom_templates (id TEXT PRIMARY KEY, json TEXT NOT NULL, created_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS compose_projects (name TEXT PRIMARY KEY, content TEXT NOT NULL, updated_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS gateway_routes (gateway TEXT PRIMARY KEY, json TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS registries (
          server TEXT PRIMARY KEY,
          username TEXT NOT NULL,
          secret TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS audit_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          at INTEGER NOT NULL,
          actor TEXT NOT NULL,
          kind TEXT NOT NULL,
          action TEXT NOT NULL,
          status INTEGER NOT NULL,
          detail TEXT NOT NULL DEFAULT ''
        );
      `);
      // Databases from before roles existed: everyone already there was an admin.
      const hasRole = (db.pragma("table_info(users)") as { name: string }[]).some(
        (c) => c.name === "role",
      );
      if (!hasRole) db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'admin'");
    },
  },
  {
    version: 2,
    name: "dns_records",
    up(db: Db) {
      db.exec(
        "CREATE TABLE IF NOT EXISTS dns_records (container TEXT PRIMARY KEY, json TEXT NOT NULL)",
      );
    },
  },
  {
    version: 3,
    name: "guard_state",
    up(db: Db) {
      db.exec("CREATE TABLE IF NOT EXISTS guard_state (key TEXT PRIMARY KEY, json TEXT NOT NULL)");
    },
  },
  {
    version: 4,
    name: "bindings",
    up(db: Db) {
      db.exec("CREATE TABLE IF NOT EXISTS bindings (id TEXT PRIMARY KEY, json TEXT NOT NULL)");
    },
  },
  {
    version: 5,
    name: "zone_specs",
    up(db: Db) {
      db.exec(
        "CREATE TABLE IF NOT EXISTS zone_specs (zone TEXT PRIMARY KEY, yaml TEXT NOT NULL, applied_at INTEGER NOT NULL)",
      );
    },
  },
  {
    version: 6,
    name: "swarm_bindings",
    up(db: Db) {
      db.exec(
        "CREATE TABLE IF NOT EXISTS swarm_bindings (id TEXT PRIMARY KEY, json TEXT NOT NULL)",
      );
    },
  },
];
