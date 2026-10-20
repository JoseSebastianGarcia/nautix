import type { Role } from "@nautix/contracts";

export interface ApiToken {
  id: string;
  name: string;
  role: Role;
  /** sha256 of the raw token; the raw value is shown once at creation and never stored. */
  tokenHash: string;
  createdAt: number;
  lastUsedAt: number | null;
}
