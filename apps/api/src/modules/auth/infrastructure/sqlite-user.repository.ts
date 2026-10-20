import type { Db } from "../../../shared/sqlite-database.js";
import { UserRepository } from "../application/ports/user-repository.js";
import type { User } from "../domain/user.js";

const COLUMNS = "id, username, password_hash AS passwordHash, role";

export class SqliteUserRepository extends UserRepository {
  constructor(private readonly db: Db) {
    super();
  }

  async count(): Promise<number> {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n;
  }

  async countAdmins(): Promise<number> {
    return (
      this.db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").get() as { n: number }
    ).n;
  }

  async list(): Promise<User[]> {
    return this.db.prepare(`SELECT ${COLUMNS} FROM users ORDER BY username`).all() as User[];
  }

  async findById(id: string): Promise<User | null> {
    return (
      (this.db.prepare(`SELECT ${COLUMNS} FROM users WHERE id = ?`).get(id) as User | undefined) ??
      null
    );
  }

  async findByUsername(username: string): Promise<User | null> {
    return (
      (this.db.prepare(`SELECT ${COLUMNS} FROM users WHERE username = ?`).get(username) as
        | User
        | undefined) ?? null
    );
  }

  async add(user: User): Promise<void> {
    this.db
      .prepare("INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)")
      .run(user.id, user.username, user.passwordHash, user.role);
  }

  async remove(id: string): Promise<void> {
    this.db.prepare("DELETE FROM sessions WHERE user_id = ?").run(id);
    this.db.prepare("DELETE FROM users WHERE id = ?").run(id);
  }
}
