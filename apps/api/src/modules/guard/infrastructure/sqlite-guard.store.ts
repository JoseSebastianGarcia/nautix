import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { GuardRule } from "@nautix/contracts";
import { z } from "zod";
import type { Db } from "../../../shared/sqlite-database.js";
import { GuardStore } from "../application/ports/guard-store.js";
import { EMPTY_STATE, type GuardState } from "../domain/guard-state.js";

const hash = (raw: string): Buffer => createHash("sha256").update(raw).digest();

const Stored = z.object({
  revision: z.number().int(),
  confirmed: z.array(GuardRule),
  pending: z.object({ rules: z.array(GuardRule), deadline: z.number() }).nullable(),
  report: z
    .object({
      revision: z.number().int(),
      backend: z.enum(["iptables", "nftables", "none"]),
      ok: z.boolean(),
      error: z.string().optional(),
      at: z.number(),
    })
    .nullable(),
  seenAt: z.number().nullable().default(null),
});

/** One small key/value table: the rules and trial state, and the hash of the helper's token. */
export class SqliteGuardStore extends GuardStore {
  constructor(private readonly db: Db) {
    super();
  }

  private read(key: string): string | undefined {
    return (
      this.db.prepare("SELECT json FROM guard_state WHERE key = ?").get(key) as
        | { json: string }
        | undefined
    )?.json;
  }

  private write(key: string, json: string): void {
    this.db
      .prepare(
        "INSERT INTO guard_state (key, json) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET json = excluded.json",
      )
      .run(key, json);
  }

  async load(): Promise<GuardState> {
    const raw = this.read("state");
    if (!raw) return EMPTY_STATE;
    const parsed = Stored.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : EMPTY_STATE;
  }

  async save(state: GuardState): Promise<void> {
    this.write("state", JSON.stringify(state));
  }

  async createToken(): Promise<string> {
    const raw = `ngd_${randomBytes(24).toString("base64url")}`;
    this.write("token", hash(raw).toString("hex"));
    return raw;
  }

  async verifyToken(raw: string): Promise<boolean> {
    const stored = this.read("token");
    if (!stored) return false;
    const expected = Buffer.from(stored, "hex");
    const given = hash(raw);
    return expected.length === given.length && timingSafeEqual(expected, given);
  }

  async hasToken(): Promise<boolean> {
    return this.read("token") !== undefined;
  }
}
