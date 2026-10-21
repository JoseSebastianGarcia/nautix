import type { Db } from "../../../shared/sqlite-database.js";
import { type AuditEntry, AuditLog, type NewAuditEntry } from "../application/ports/audit-log.js";

const KEEP = 20_000;
const TRIM_EVERY = 200;

export class SqliteAuditLog extends AuditLog {
  private writes = 0;

  constructor(private readonly db: Db) {
    super();
  }

  record(e: NewAuditEntry): void {
    this.db
      .prepare(
        "INSERT INTO audit_log (at, actor, kind, action, status, detail) VALUES (?,?,?,?,?,?)",
      )
      .run(Date.now(), e.actor, e.kind, e.action, e.status, e.detail.slice(0, 500));
    if (++this.writes % TRIM_EVERY === 0)
      this.db
        .prepare("DELETE FROM audit_log WHERE id <= (SELECT MAX(id) FROM audit_log) - ?")
        .run(KEEP);
  }

  list(limit: number, before?: number, q?: string): AuditEntry[] {
    // LIKE with the wildcards of the search text escaped, so "50%" looks for those characters.
    const like = q ? `%${q.replace(/[\\%_]/g, "\\$&")}%` : null;
    return this.db
      .prepare(
        `SELECT id, at, actor, kind, action, status, detail FROM audit_log
         WHERE (? IS NULL OR id < ?)
           AND (? IS NULL OR action LIKE ? ESCAPE '\\' OR detail LIKE ? ESCAPE '\\')
         ORDER BY id DESC LIMIT ?`,
      )
      .all(before ?? null, before ?? null, like, like, like, limit) as AuditEntry[];
  }
}
