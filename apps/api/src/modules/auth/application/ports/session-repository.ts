export interface StoredSession {
  userId: string;
  username: string;
  expiresAt: number;
}

/** Stores sessions by the sha256 of the cookie token — the raw token is never persisted. */
export abstract class SessionRepository {
  abstract add(tokenHash: string, session: StoredSession): Promise<void>;
  abstract find(tokenHash: string): Promise<StoredSession | null>;
  abstract remove(tokenHash: string): Promise<void>;
}
