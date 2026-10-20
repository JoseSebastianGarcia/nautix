import type { Db } from "../../../shared/sqlite-database.js";
import { ApiTokenRepository } from "../application/ports/api-token-repository.js";
import type { ApiToken } from "../domain/api-token.js";

const COLUMNS =
  "id, name, role, token_hash AS tokenHash, created_at AS createdAt, last_used_at AS lastUsedAt";

export class SqliteApiTokenRepository extends ApiTokenRepository {
  constructor(private readonly db: Db) {
    super();
  }

  async add(t: ApiToken): Promise<void> {
    this.db
      .prepare(
        "INSERT INTO api_tokens (id, name, role, token_hash, created_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(t.id, t.name, t.role, t.tokenHash, t.createdAt, t.lastUsedAt);
  }

  async list(): Promise<ApiToken[]> {
    return this.db
      .prepare(`SELECT ${COLUMNS} FROM api_tokens ORDER BY created_at DESC`)
      .all() as ApiToken[];
  }

  async findByHash(tokenHash: string): Promise<ApiToken | null> {
    return (
      (this.db.prepare(`SELECT ${COLUMNS} FROM api_tokens WHERE token_hash = ?`).get(tokenHash) as
        | ApiToken
        | undefined) ?? null
    );
  }

  async touch(id: string, at: number): Promise<void> {
    this.db.prepare("UPDATE api_tokens SET last_used_at = ? WHERE id = ?").run(at, id);
  }

  async remove(id: string): Promise<void> {
    this.db.prepare("DELETE FROM api_tokens WHERE id = ?").run(id);
  }
}
