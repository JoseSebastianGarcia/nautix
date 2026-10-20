import type { Db } from "../../../shared/sqlite-database.js";
import { SessionRepository, type StoredSession } from "../application/ports/session-repository.js";

export class SqliteSessionRepository extends SessionRepository {
  constructor(private readonly db: Db) {
    super();
  }

  async add(tokenHash: string, s: StoredSession): Promise<void> {
    this.db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
    this.db
      .prepare(
        "INSERT INTO sessions (token_hash, user_id, username, expires_at) VALUES (?, ?, ?, ?)",
      )
      .run(tokenHash, s.userId, s.username, s.expiresAt);
  }

  async find(tokenHash: string): Promise<StoredSession | null> {
    const row = this.db
      .prepare(
        "SELECT user_id AS userId, username, expires_at AS expiresAt FROM sessions WHERE token_hash = ?",
      )
      .get(tokenHash) as StoredSession | undefined;
    return row ?? null;
  }

  async removeForUser(userId: string, exceptTokenHash?: string): Promise<void> {
    this.db
      .prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?")
      .run(userId, exceptTokenHash ?? "");
  }

  async remove(tokenHash: string): Promise<void> {
    this.db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
  }
}
