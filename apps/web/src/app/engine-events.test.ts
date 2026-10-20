import { afterEach, describe, expect, it, vi } from "vitest";
import { createCoalescer, keysFor } from "./engine-events.js";

afterEach(() => vi.useRealTimers());

describe("engine events", () => {
  it("coalesces a burst into one flush", () => {
    vi.useFakeTimers();
    const flush = vi.fn();
    const c = createCoalescer(flush, 100);
    c.push("container");
    c.push("container");
    c.push("network");
    vi.advanceTimersByTime(100);
    expect(flush).toHaveBeenCalledTimes(1);
    const batch = (flush.mock.calls[0]?.[0] ?? new Set()) as Set<string>;
    expect([...batch]).toEqual(["container", "network"]);
  });

  it("a container change also refreshes networks (membership)", () => {
    expect(keysFor("container")).toContainEqual(["networks"]);
  });
});
