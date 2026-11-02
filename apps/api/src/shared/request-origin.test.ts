import { describe, expect, it } from "vitest";
import { sameOrigin } from "./request-origin.js";

describe("sameOrigin", () => {
  it("matches the host the request was sent to", () => {
    expect(sameOrigin("https://127.0.0.1:3737", "127.0.0.1:3737")).toBe(true);
    expect(sameOrigin("https://evil.example", "127.0.0.1:3737")).toBe(false);
  });

  it("refuses an Origin that is not a URL instead of throwing", () => {
    expect(sameOrigin("null", "127.0.0.1:3737")).toBe(false);
    expect(sameOrigin("", "127.0.0.1:3737")).toBe(false);
    expect(sameOrigin("not a url", undefined)).toBe(false);
  });
});
