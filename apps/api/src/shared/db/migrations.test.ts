import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { openDatabase } from "../sqlite-database.js";
import { currentVersion, type Migration, runMigrations, SchemaTooNewError } from "./migrations.js";
import { MIGRATIONS } from "./schema.js";

const memory = () => new Database(":memory:");
const create = (version: number, sql: string): Migration => ({
  version,
  name: `m${version}`,
  up: (db) => db.exec(sql),
});

describe("runMigrations", () => {
  it("applies pending migrations in order, once, and records them", () => {
    const db = memory();
    const list = [create(1, "CREATE TABLE a (x)"), create(2, "ALTER TABLE a ADD COLUMN y")];
    expect(runMigrations(db, list)).toEqual([1, 2]);
    expect(currentVersion(db)).toBe(2);
    expect(runMigrations(db, list)).toEqual([]);
    expect(db.prepare("SELECT name FROM schema_migrations ORDER BY version").all()).toEqual([
      { name: "m1" },
      { name: "m2" },
    ]);
  });

  it("applies only what is new when the app gains a migration", () => {
    const db = memory();
    runMigrations(db, [create(1, "CREATE TABLE a (x)")]);
    expect(
      runMigrations(db, [create(1, "CREATE TABLE a (x)"), create(2, "CREATE TABLE b (y)")]),
    ).toEqual([2]);
  });

  it("rolls a failing migration back and keeps the earlier ones", () => {
    const db = memory();
    const list = [
      create(1, "CREATE TABLE a (x)"),
      create(2, "CREATE TABLE b (y); INSERT INTO nope VALUES (1)"),
    ];
    expect(() => runMigrations(db, list)).toThrow();
    expect(currentVersion(db)).toBe(1);
    expect(db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'b'").get()).toBeUndefined();
  });

  it("refuses a database written by a newer Nautix", () => {
    const db = memory();
    runMigrations(db, [create(1, "CREATE TABLE a (x)"), create(2, "CREATE TABLE b (y)")]);
    expect(() => runMigrations(db, [create(1, "CREATE TABLE a (x)")])).toThrow(SchemaTooNewError);
  });

  it("rejects a migration list with gaps or repeats", () => {
    expect(() => runMigrations(memory(), [create(1, "SELECT 1"), create(3, "SELECT 1")])).toThrow();
    expect(() => runMigrations(memory(), [create(2, "SELECT 1")])).toThrow();
  });

  it("asks for a backup only when the database already holds data", () => {
    const calls: number[] = [];
    const fresh = memory();
    runMigrations(fresh, [create(1, "CREATE TABLE a (x)")], {
      beforeMigrate: (v) => calls.push(v),
    });
    expect(calls).toEqual([]);
    runMigrations(fresh, [create(1, "CREATE TABLE a (x)"), create(2, "CREATE TABLE b (y)")], {
      beforeMigrate: (v) => calls.push(v),
    });
    expect(calls).toEqual([1]);
  });
});

describe("the real schema", () => {
  it("creates every table on a fresh data directory without a backup", () => {
    const dir = mkdtempSync(join(tmpdir(), "nautix-db-"));
    const db = openDatabase(dir);
    const tables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]
    ).map((t) => t.name);
    for (const t of [
      "users",
      "sessions",
      "api_tokens",
      "layout",
      "custom_templates",
      "compose_projects",
      "gateway_routes",
      "registries",
      "audit_log",
      "schema_migrations",
    ])
      expect(tables).toContain(t);
    expect(currentVersion(db)).toBe(MIGRATIONS.length);
    expect(readdirSync(dir)).not.toContain("backups");
  });

  it("adopts a database from before migrations existed: keeps the data, adds the role column, takes a backup", () => {
    const dir = mkdtempSync(join(tmpdir(), "nautix-db-"));
    const legacy = new Database(join(dir, "nautix.db"));
    legacy.exec(`
      CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL);
      INSERT INTO users VALUES ('1', 'old-admin', 'hash');
      CREATE TABLE layout (id INTEGER PRIMARY KEY CHECK (id = 1), json TEXT NOT NULL);
      INSERT INTO layout VALUES (1, '{"zones":{},"nodes":{}}');
    `);
    legacy.close();

    const db = openDatabase(dir);
    expect(db.prepare("SELECT username, role FROM users").all()).toEqual([
      { username: "old-admin", role: "admin" },
    ]);
    expect(db.prepare("SELECT json FROM layout").get()).toEqual({
      json: '{"zones":{},"nodes":{}}',
    });
    expect(currentVersion(db)).toBe(MIGRATIONS.length);

    const backups = readdirSync(join(dir, "backups"));
    expect(backups).toHaveLength(1);
    expect(backups[0]).toContain("pre-migrate-from-v0-");
    const copy = new Database(join(dir, "backups", backups[0] as string), { readonly: true });
    expect(copy.prepare("SELECT COUNT(*) AS n FROM users").get()).toEqual({ n: 1 });
    copy.close();

    openDatabase(dir); // a second open changes nothing and takes no new backup
    expect(readdirSync(join(dir, "backups"))).toHaveLength(1);
  });

  it("refuses to open a database from a newer version", () => {
    const dir = mkdtempSync(join(tmpdir(), "nautix-db-"));
    const db = openDatabase(dir);
    db.prepare(
      "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, 'future', 0)",
    ).run(MIGRATIONS.length + 1);
    db.close();
    expect(() => openDatabase(dir)).toThrow(SchemaTooNewError);
  });
});
