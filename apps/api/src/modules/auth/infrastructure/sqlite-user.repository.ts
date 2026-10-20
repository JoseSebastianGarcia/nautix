import { UserRepository } from "../application/ports/user-repository.js";
import type { User } from "../domain/user.js";
import type { Db } from "./sqlite-database.js";

export class SqliteUserRepository extends UserRepository {
  constructor(private readonly db: Db) {
    super();
  }

  async count(): Promise<number> {
    const row = this.db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number };
    return row.n;
  }

  async findByUsername(username: string): Promise<User | null> {
    const row = this.db
      .prepare("SELECT id, username, password_hash AS passwordHash FROM users WHERE username = ?")
      .get(username) as User | undefined;
    return row ?? null;
  }

  async add(user: User): Promise<void> {
    this.db
      .prepare("INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)")
      .run(user.id, user.username, user.passwordHash);
  }
}
