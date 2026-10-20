import { GatewayRoute } from "@nautix/contracts";
import { z } from "zod";
import type { Db } from "../../../shared/sqlite-database.js";
import { GatewayRoutesRepository } from "../application/ports/gateway-routes-repository.js";

/** Routes are keyed by the gateway container's name (stable across recreation). */
export class SqliteGatewayRoutesRepository extends GatewayRoutesRepository {
  constructor(private readonly db: Db) {
    super();
  }

  async get(gateway: string): Promise<GatewayRoute[]> {
    const row = this.db.prepare("SELECT json FROM gateway_routes WHERE gateway = ?").get(gateway) as
      | { json: string }
      | undefined;
    if (!row) return [];
    const parsed = z.array(GatewayRoute).safeParse(JSON.parse(row.json));
    return parsed.success ? parsed.data : [];
  }

  async save(gateway: string, routes: GatewayRoute[]): Promise<void> {
    this.db
      .prepare(
        "INSERT INTO gateway_routes (gateway, json) VALUES (?, ?) ON CONFLICT(gateway) DO UPDATE SET json = excluded.json",
      )
      .run(gateway, JSON.stringify(routes));
  }
}
