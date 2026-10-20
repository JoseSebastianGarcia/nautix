import { describe, expect, it } from "vitest";
import { wsUrl } from "./terminal-page.js";

describe("wsUrl", () => {
  it("uses wss on https and encodes the id", () => {
    const loc = { protocol: "https:", host: "nautix.local" } as Location;
    expect(wsUrl("a b", 80, 24, loc)).toBe("wss://nautix.local/ws/terminal/a%20b?cols=80&rows=24");
  });
});
