import { describe, expect, it } from "vitest";
import { LoginRateLimiter } from "./login-rate-limiter.js";

describe("LoginRateLimiter", () => {
  it("blocks after max attempts and recovers after the window", () => {
    const limiter = new LoginRateLimiter(2, 1000);
    limiter.check("ip", 0);
    limiter.check("ip", 10);
    expect(() => limiter.check("ip", 20)).toThrow();
    expect(() => limiter.check("ip", 2000)).not.toThrow();
  });
});
