import { DnsRecord } from "@nautix/contracts";
import { z } from "zod";
import type { Db } from "../../../shared/sqlite-database.js";
import { DnsRecordsRepository } from "../application/ports/dns-records-repository.js";

/** Records are keyed by the DNS container's name (stable across recreation). */
export class SqliteDnsRecordsRepository extends DnsRecordsRepository {
  constructor(private readonly db: Db) {
    super();
  }

  async get(container: string): Promise<DnsRecord[]> {
    const row = this.db
      .prepare("SELECT json FROM dns_records WHERE container = ?")
      .get(container) as { json: string } | undefined;
    if (!row) return [];
    const parsed = z.array(DnsRecord).safeParse(JSON.parse(row.json));
    return parsed.success ? parsed.data : [];
  }

  async save(container: string, records: DnsRecord[]): Promise<void> {
    this.db
      .prepare(
        "INSERT INTO dns_records (container, json) VALUES (?, ?) ON CONFLICT(container) DO UPDATE SET json = excluded.json",
      )
      .run(container, JSON.stringify(records));
  }
}
