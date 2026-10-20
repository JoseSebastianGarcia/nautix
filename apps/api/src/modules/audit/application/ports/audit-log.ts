export interface AuditEntry {
  id: number;
  at: number;
  /** Username or API token name; `-` when nobody is signed in (login attempts). */
  actor: string;
  /** `session`, `token` or `anonymous`. */
  kind: string;
  /** e.g. `DELETE /api/v1/containers/:id` or `terminal.open`. */
  action: string;
  /** HTTP status of the answer; 0 for events that have none. */
  status: number;
  detail: string;
}

export type NewAuditEntry = Omit<AuditEntry, "id" | "at">;

/** Append-only trail of who changed what. Never holds request bodies or secrets. */
export abstract class AuditLog {
  abstract record(entry: NewAuditEntry): void;
  /** Newest first. */
  abstract list(limit: number, before?: number): AuditEntry[];
}
