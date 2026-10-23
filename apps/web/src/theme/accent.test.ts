import { describe, expect, it } from "vitest";
import {
  ALLOWED_HUE,
  accentVars,
  contrast,
  DEFAULT_ACCENT,
  PRESET_ACCENTS,
  parseHex,
  resolveAccent,
  resolveCompanion,
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
    expect(resolveAccent("#15a9bc", "dark").hueMoved).toBe(false);
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

  it("pairs the default teal with an emerald companion, readable in both themes", () => {
    for (const theme of ["dark", "light"] as const) {
      const second = resolveCompanion(DEFAULT_ACCENT, theme);
      expect(hueOf(second.accent)).toBeGreaterThanOrEqual(164);
      expect(hueOf(second.accent)).toBeLessThan(200);
      expect(second.ratio).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps every companion out of red, green and yellow", () => {
    for (const hex of [...PRESET_ACCENTS, "#ff0000", "#00ff00", "#ffd000"]) {
      for (const theme of ["dark", "light"] as const) {
        const h = hueOf(resolveCompanion(hex, theme).accent);
        expect(h).toBeGreaterThanOrEqual(ALLOWED_HUE[0] - 1);
        expect(h).toBeLessThanOrEqual(ALLOWED_HUE[1] + 1);
      }
    }
  });

  it("exposes the second color and the glow as variables", () => {
    expect(Object.keys(accentVars(DEFAULT_ACCENT, "dark"))).toEqual(
      expect.arrayContaining([
        "--nx-accent-2",
        "--nx-zone-2",
        "--nx-zone-line-2",
        "--nx-aurora-glow",
      ]),
    );
  });
});
