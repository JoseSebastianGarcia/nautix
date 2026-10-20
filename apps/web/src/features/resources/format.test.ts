import { describe, expect, it } from "vitest";
import { formatBytes } from "./format.js";

describe("formatBytes", () => {
  it("formats sizes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(80_000_000)).toBe("76 MB");
  });
});
