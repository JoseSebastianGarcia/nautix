import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { packBackup } from "../domain/backup-archive.js";
import { applyPendingRestore } from "./apply-pending-restore.js";
import { FileBackupService } from "./file-backup-service.js";

const makeData = (marker: string): string => {
  const dir = mkdtempSync(join(tmpdir(), "nautix-data-"));
  const db = new Database(join(dir, "nautix.db"));
  db.exec("CREATE TABLE users (id TEXT); CREATE TABLE marker (v TEXT)");
  db.prepare("INSERT INTO marker VALUES (?)").run(marker);
  db.close();
  writeFileSync(join(dir, ".key"), `key-${marker}`);
  return dir;
};

const marker = (dir: string): string => {
  const db = new Database(join(dir, "nautix.db"), { readonly: true });
  const row = db.prepare("SELECT v FROM marker").get() as { v: string };
  db.close();
  return row.v;
};

describe("backup and restore", () => {
  it("restores the staged state on next start and keeps the previous one", async () => {
    const source = makeData("from-backup");
    const archive = await new FileBackupService(source).create();

    const target = makeData("current");
    const summary = await new FileBackupService(target).stageRestore(archive);
    expect(summary.files).toContain("nautix.db");
    expect(marker(target)).toBe("current"); // nothing changes until the restart

    expect(applyPendingRestore(target)).toBe(true);
    expect(marker(target)).toBe("from-backup");
    expect(readFileSync(join(target, ".key"), "utf8")).toBe("key-from-backup");
    const kept = readdirSync(target).find((n) => n.startsWith("before-restore-"));
    expect(kept).toBeDefined();
    expect(marker(join(target, kept as string))).toBe("current");
    expect(existsSync(join(target, "restore-pending"))).toBe(false);
    expect(applyPendingRestore(target)).toBe(false);
  });

  it("refuses a backup whose database is not a Nautix database", async () => {
    const target = makeData("current");
    const bad = packBackup({ "nautix.db": Buffer.from("this is not sqlite") });
    await expect(new FileBackupService(target).stageRestore(bad)).rejects.toThrow();
    expect(existsSync(join(target, "restore-pending"))).toBe(false);
  });
});
