import type { ComposeProject, ComposeProjectSummary } from "@nautix/contracts";
import type { Db } from "../../../shared/sqlite-database.js";
import { ComposeProjectRepository } from "../application/ports/compose-project-repository.js";

export class SqliteComposeProjectRepository extends ComposeProjectRepository {
  constructor(private readonly db: Db) {
    super();
  }

  async list(): Promise<ComposeProjectSummary[]> {
    return this.db
      .prepare("SELECT name, updated_at AS updatedAt FROM compose_projects ORDER BY name")
      .all() as ComposeProjectSummary[];
  }

  async get(name: string): Promise<ComposeProject | null> {
    return (
      (this.db
        .prepare(
          "SELECT name, content, updated_at AS updatedAt FROM compose_projects WHERE name = ?",
        )
        .get(name) as ComposeProject | undefined) ?? null
    );
  }

  async save(name: string, content: string, at: number): Promise<void> {
    this.db
      .prepare(
        "INSERT INTO compose_projects (name, content, updated_at) VALUES (?, ?, ?) ON CONFLICT(name) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at",
      )
      .run(name, content, at);
  }

  async remove(name: string): Promise<void> {
    this.db.prepare("DELETE FROM compose_projects WHERE name = ?").run(name);
  }
}
