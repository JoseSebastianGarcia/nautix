import { mkdirSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";

export type Db = Database.Database;

export const openDatabase = (dataDir: string): Db => {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const db = new Database(join(dataDir, "nautix.db"));
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );
  `);
  return db;
};
