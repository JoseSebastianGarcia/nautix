import type { Binding } from "@nautix/contracts";
import type { Db } from "../../../shared/sqlite-database.js";
import { BindingStore } from "../application/ports/binding-store.js";

/** Bindings are keyed by their id and refer to containers by name (stable across recreation). */
export class SqliteBindingStore extends BindingStore {
  constructor(private readonly db: Db) {
    super();
  }

  async list(): Promise<Binding[]> {
    const rows = this.db.prepare("SELECT json FROM bindings").all() as { json: string }[];
    return rows
      .map((r) => JSON.parse(r.json) as Binding)
      .sort((a, b) => a.consumer.localeCompare(b.consumer) || a.name.localeCompare(b.name));
  }

  async get(id: string): Promise<Binding | null> {
    const row = this.db.prepare("SELECT json FROM bindings WHERE id = ?").get(id) as
      | { json: string }
      | undefined;
    return row ? (JSON.parse(row.json) as Binding) : null;
  }

  async save(binding: Binding): Promise<void> {
    this.db
      .prepare(
        "INSERT INTO bindings (id, json) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json",
      )
      .run(binding.id, JSON.stringify(binding));
  }

  async delete(id: string): Promise<void> {
    this.db.prepare("DELETE FROM bindings WHERE id = ?").run(id);
  }
}
