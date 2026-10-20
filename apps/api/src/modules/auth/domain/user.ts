import type { Role } from "@nautix/contracts";

export interface User {
  id: string;
  username: string;
  passwordHash: string;
  role: Role;
}

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const TOKEN_PREFIX = "nx_";
