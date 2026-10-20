import { TooManyRequestsError } from "../../../shared/domain-error.js";

/** Sliding window per key (IP). In-memory is enough: single process, SQLite storage. */
export class LoginRateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly max = 8,
    private readonly windowMs = 60_000,
  ) {}

  check(key: string, now = Date.now()): void {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      throw new TooManyRequestsError("too many attempts", "errors.rateLimited");
    }
    recent.push(now);
    this.hits.set(key, recent);
  }
}
