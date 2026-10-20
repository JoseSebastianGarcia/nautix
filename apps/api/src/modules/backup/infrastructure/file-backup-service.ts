import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";
import { ValidationError } from "../../../shared/domain-error.js";
import { BackupService, type RestoreSummary } from "../application/ports/backup-service.js";
import { packBackup, unpackBackup } from "../domain/backup-archive.js";

export const PENDING_DIR = "restore-pending";

export class FileBackupService extends BackupService {
  constructor(private readonly dataDir: string) {
    super();
  }

  async create(): Promise<Buffer> {
    const files: Record<string, Buffer> = {};
    const scratch = await mkdtemp(join(tmpdir(), "nautix-backup-"));
    try {
      const copy = join(scratch, "nautix.db");
      const source = new Database(join(this.dataDir, "nautix.db"), { fileMustExist: true });
      try {
        await source.backup(copy); // online backup: consistent even while Nautix is writing
      } finally {
        source.close();
      }
      files["nautix.db"] = readFileSync(copy);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
    const key = join(this.dataDir, ".key");
    if (existsSync(key)) files[".key"] = readFileSync(key);
    const tlsDir = join(this.dataDir, "tls");
    if (existsSync(tlsDir))
      for (const name of readdirSync(tlsDir)) {
        const path = `tls/${name}`;
        if (/\.(pem|json)$/.test(name)) files[path] = readFileSync(join(tlsDir, name));
      }
    return packBackup(files);
  }

  async stageRestore(archive: Buffer): Promise<RestoreSummary> {
    const files = unpackBackup(archive);
    const probe = await mkdtemp(join(tmpdir(), "nautix-restore-"));
    try {
      const path = join(probe, "nautix.db");
      writeFileSync(path, files["nautix.db"] as Buffer);
      let db: Database.Database | undefined;
      try {
        db = new Database(path, { readonly: true });
        const ok = db.pragma("integrity_check", { simple: true });
        const users = db
          .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
          .get();
        if (ok !== "ok" || !users) throw new Error("not a Nautix database");
      } catch {
        throw new ValidationError(
          "the database in the backup is not valid",
          "errors.backupInvalid",
        );
      } finally {
        db?.close();
      }
    } finally {
      rmSync(probe, { recursive: true, force: true });
    }
    const pending = join(this.dataDir, PENDING_DIR);
    rmSync(pending, { recursive: true, force: true });
    for (const [name, data] of Object.entries(files)) {
      const target = join(pending, name);
      mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
      writeFileSync(target, data, { mode: name === "nautix.db" ? 0o644 : 0o600 });
    }
    return { files: Object.keys(files), createdAt: null };
  }
}
