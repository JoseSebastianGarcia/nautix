import type { Db } from "../../../shared/sqlite-database.js";
import { type StoredZone, ZoneStore } from "../application/ports/zone-store.js";

export class SqliteZoneStore extends ZoneStore {
  constructor(private readonly db: Db) {
    super();
  }

  async get(zone: string): Promise<StoredZone | null> {
    const row = this.db
      .prepare("SELECT yaml, applied_at AS appliedAt FROM zone_specs WHERE zone = ?")
      .get(zone) as StoredZone | undefined;
    return row ?? null;
  }

  async save(zone: string, yaml: string): Promise<void> {
    this.db
      .prepare(
        "INSERT INTO zone_specs (zone, yaml, applied_at) VALUES (?, ?, ?) ON CONFLICT(zone) DO UPDATE SET yaml = excluded.yaml, applied_at = excluded.applied_at",
      )
      .run(zone, yaml, Date.now());
  }

  async names(): Promise<string[]> {
    return (this.db.prepare("SELECT zone FROM zone_specs").all() as { zone: string }[]).map(
      (r) => r.zone,
    );
  }
}
