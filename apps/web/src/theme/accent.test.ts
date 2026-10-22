import { describe, expect, it } from "vitest";
import {
  ALLOWED_HUE,
  accentVars,
  contrast,
  PRESET_ACCENTS,
  parseHex,
  resolveAccent,
  rgbToHsl,
  snapHue,
} from "./accent.js";

const hueOf = (hex: string) => rgbToHsl(parseHex(hex) ?? [0, 0, 0])[0];

describe("accent", () => {
  it("moves red, green and yellow to an allowed hue", () => {
    for (const bad of ["#ff0000", "#00ff00", "#ffd000", "#ff8800"]) {
      const { accent, hueMoved } = resolveAccent(bad, "dark");
      expect(hueMoved).toBe(true);
      const h = hueOf(accent);
      expect(h).toBeGreaterThanOrEqual(ALLOWED_HUE[0] - 1);
      expect(h).toBeLessThanOrEqual(ALLOWED_HUE[1] + 1);
    }
  });

  it("keeps allowed hues", () => {
    expect(snapHue(260)).toBe(260);
    expect(resolveAccent("#3b82f6", "dark").hueMoved).toBe(false);
  });

  it("every preset is readable in both themes", () => {
    for (const hex of PRESET_ACCENTS) {
      for (const theme of ["dark", "light"] as const) {
        expect(resolveAccent(hex, theme).ratio).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("adjusts a color that is too dark or too light for the theme", () => {
    const dark = resolveAccent("#1a1060", "dark");
    expect(dark.adjusted).toBe(true);
    expect(dark.ratio).toBeGreaterThanOrEqual(4.5);
    expect(resolveAccent("#d8d0ff", "light").ratio).toBeGreaterThanOrEqual(4.5);
  });

  it("picks a readable foreground and falls back on invalid input", () => {
    const r = resolveAccent("not-a-color", "dark");
    const bg = parseHex(r.accent) ?? [0, 0, 0];
    const fg = parseHex(r.fg) ?? [0, 0, 0];
    expect(contrast(bg, fg)).toBeGreaterThan(3);
    expect(Object.keys(accentVars("#6366f1", "light"))).toContain("--nx-accent-soft");
  });
});
