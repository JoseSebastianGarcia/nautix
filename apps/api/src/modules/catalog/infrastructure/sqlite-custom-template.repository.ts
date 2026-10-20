import type { Template } from "@nautix/contracts";
import type { Db } from "../../../shared/sqlite-database.js";
import { CustomTemplateRepository } from "../application/ports/custom-template-repository.js";

/** Templates are small JSON documents keyed by id. */
export class SqliteCustomTemplateRepository extends CustomTemplateRepository {
  constructor(private readonly db: Db) {
    super();
  }

  async list(): Promise<Template[]> {
    const rows = this.db
      .prepare("SELECT json FROM custom_templates ORDER BY created_at, id")
      .all() as { json: string }[];
    return rows.map((r) => JSON.parse(r.json) as Template);
  }

  async save(template: Template): Promise<void> {
    this.db
      .prepare(
        "INSERT INTO custom_templates (id, json, created_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json",
      )
      .run(template.id, JSON.stringify(template), Date.now());
  }

  async remove(id: string): Promise<void> {
    this.db.prepare("DELETE FROM custom_templates WHERE id = ?").run(id);
  }

  async count(): Promise<number> {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM custom_templates").get() as { n: number }).n;
  }
}
