import type { SwarmBinding } from "@nautix/contracts";
import type { Db } from "../../../shared/sqlite-database.js";
import { SwarmBindingStore } from "../application/ports/swarm-binding-store.js";

/** Bindings between services, by service name (stable across updates, unlike ids of replaced tasks). */
export class SqliteSwarmBindingStore extends SwarmBindingStore {
  constructor(private readonly db: Db) {
    super();
  }

  async list(): Promise<SwarmBinding[]> {
    const rows = this.db.prepare("SELECT json FROM swarm_bindings").all() as { json: string }[];
    return rows
      .map((r) => JSON.parse(r.json) as SwarmBinding)
      .sort((a, b) => a.consumer.localeCompare(b.consumer) || a.name.localeCompare(b.name));
  }

  async get(id: string): Promise<SwarmBinding | null> {
    const row = this.db.prepare("SELECT json FROM swarm_bindings WHERE id = ?").get(id) as
      | { json: string }
      | undefined;
    return row ? (JSON.parse(row.json) as SwarmBinding) : null;
  }

  async save(binding: SwarmBinding): Promise<void> {
    this.db
      .prepare(
        "INSERT INTO swarm_bindings (id, json) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json",
      )
      .run(binding.id, JSON.stringify(binding));
  }

  async delete(id: string): Promise<void> {
    this.db.prepare("DELETE FROM swarm_bindings WHERE id = ?").run(id);
  }
}
