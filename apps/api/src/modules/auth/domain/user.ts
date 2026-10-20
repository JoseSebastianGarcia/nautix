export interface User {
  id: string;
  username: string;
  passwordHash: string;
}

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
