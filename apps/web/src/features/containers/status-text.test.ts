import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";
import { statusText } from "./status-text.js";

// A stand-in for `t` that shows the key and the values it got.
const t = ((key: string, o?: Record<string, unknown>) =>
  o ? `${key}${JSON.stringify(o)}` : key) as unknown as TFunction;

describe("statusText", () => {
  it("translates how long a container has been up", () => {
    expect(statusText("Up less than a second", t)).toBe(
      'status.up{"time":"status.time.lessThanSecond"}',
    );
    expect(statusText("Up 3 minutes", t)).toBe(
      'status.up{"time":"status.time.minute{\\"count\\":3}"}',
    );
    expect(statusText("Up About an hour", t)).toContain("status.time.aboutHour");
  });

  it("keeps the health note", () => {
    expect(statusText("Up 2 days (healthy)", t)).toMatch(/\(status\.healthy\)$/);
  });

  it("translates exited and restarting lines", () => {
    expect(statusText("Exited (137) 5 hours ago", t)).toContain('"code":"137"');
    expect(statusText("Restarting (1) 12 seconds ago", t)).toContain("status.restarting");
  });

  it("returns what the engine wrote when it does not know the shape", () => {
    expect(statusText("Something new", t)).toBe("Something new");
  });
});
