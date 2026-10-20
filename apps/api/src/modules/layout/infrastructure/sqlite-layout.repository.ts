import { Layout } from "@nautix/contracts";
import type { Db } from "../../../shared/sqlite-database.js";
import { LayoutRepository } from "../application/ports/layout-repository.js";

const EMPTY: Layout = { zones: {}, nodes: {} };

/** A single JSON document (row id 1): the canvas layout is small and always read/written whole. */
export class SqliteLayoutRepository extends LayoutRepository {
  constructor(private readonly db: Db) {
    super();
    db.exec(
      "CREATE TABLE IF NOT EXISTS layout (id INTEGER PRIMARY KEY CHECK (id = 1), json TEXT NOT NULL)",
    );
  }

  async get(): Promise<Layout> {
    const row = this.db.prepare("SELECT json FROM layout WHERE id = 1").get() as
      | { json: string }
      | undefined;
    if (!row) return EMPTY;
    const parsed = Layout.safeParse(JSON.parse(row.json));
    return parsed.success ? parsed.data : EMPTY;
  }

  async save(layout: Layout): Promise<void> {
    this.db
      .prepare(
        "INSERT INTO layout (id, json) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json",
      )
      .run(JSON.stringify(layout));
  }
}
