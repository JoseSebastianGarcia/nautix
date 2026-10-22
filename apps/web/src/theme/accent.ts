/**
 * The accent is a fine detail (selection, links, zones, focus), never a state color.
 * Red, green and yellow/orange mean error, ok and warning, so hues in those ranges are moved
 * to the nearest allowed hue, and lightness is adjusted until the text contrast is readable.
 */
export type Rgb = [number, number, number];

export const ALLOWED_HUE: [number, number] = [165, 345];
/** Aurora: teal that fades into emerald (see companionHue). */
export const DEFAULT_ACCENT = "#15a9bc";
export const PRESET_ACCENTS = [
  "#15a9bc",
  "#3b82f6",
  "#8b7cf6",
  "#6366f1",
  "#38bdf8",
  "#14b8a6",
  "#d946ef",
  "#ec4899",
] as const;

const SURFACE = { dark: "#111113", light: "#fafafa" } as const;
const MIN_CONTRAST = 4.5;

export const parseHex = (hex: string): Rgb | null => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m?.[1]) return null;
  const n = Number.parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const toHex = ([r, g, b]: Rgb): string =>
  `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

export const rgbToHsl = ([r, g, b]: Rgb): [number, number, number] => {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255] as const;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === rn ? ((gn - bn) / d) % 6 : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
};

export const hslToRgb = (h: number, s: number, l: number): Rgb => {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const sector = Math.floor((((h % 360) + 360) % 360) / 60);
  const [r, g, b] = (
    [
      [c, x, 0],
      [x, c, 0],
      [0, c, x],
      [0, x, c],
      [x, 0, c],
      [c, 0, x],
    ] as const
  )[sector] ?? [0, 0, 0];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
};

const luminance = ([r, g, b]: Rgb): number => {
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

export const contrast = (a: Rgb, b: Rgb): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

/** Nearest hue inside the allowed range; hues already allowed are untouched. */
export const snapHue = (hue: number): number => {
  const [lo, hi] = ALLOWED_HUE;
  if (hue >= lo && hue <= hi) return hue;
  const toLo = Math.min(Math.abs(hue - lo), 360 - Math.abs(hue - lo));
  const toHi = Math.min(Math.abs(hue - hi), 360 - Math.abs(hue - hi));
  return toLo <= toHi ? lo : hi;
};

export interface AccentResult {
  /** The color used for text and details on the theme's surface. */
  accent: string;
  /** Foreground to put on top of the accent. */
  fg: string;
  ratio: number;
  /** True when the chosen hue was moved out of red/green/yellow. */
  hueMoved: boolean;
  /** True when lightness had to change to be readable. */
  adjusted: boolean;
}

export const resolveAccent = (hex: string, theme: "dark" | "light"): AccentResult => {
  const rgb = parseHex(hex) ?? (parseHex(DEFAULT_ACCENT) as Rgb);
  const [h, s0, l0] = rgbToHsl(rgb);
  const hue = snapHue(h);
  const s = Math.max(s0, 0.45);
  const surface = parseHex(SURFACE[theme]) as Rgb;
  const step = theme === "dark" ? 0.01 : -0.01;
  let l = l0;
  let out = hslToRgb(hue, s, l);
  while (contrast(out, surface) < MIN_CONTRAST && l > 0.05 && l < 0.97) {
    l += step;
    out = hslToRgb(hue, s, l);
  }
  const white: Rgb = [255, 255, 255];
  const black: Rgb = [9, 9, 11];
  return {
    accent: toHex(out),
    fg: contrast(out, white) >= contrast(out, black) ? "#ffffff" : "#09090b",
    ratio: contrast(out, surface),
    hueMoved: Math.round(hue) !== Math.round(h),
    adjusted: Math.abs(l - l0) > 0.005,
  };
};

/** How far the second color sits from the accent on the hue wheel (blue 217° -> teal 177°). */
const COMPANION_SHIFT = 40;

/**
 * The second color of the aurora: the accent's hue moved toward teal, kept inside the allowed range
 * (never red, green or yellow) and readable like the accent itself.
 */
export const resolveCompanion = (hex: string, theme: "dark" | "light"): AccentResult => {
  const rgb = parseHex(hex) ?? (parseHex(DEFAULT_ACCENT) as Rgb);
  const [h, s, l] = rgbToHsl(rgb);
  const shifted = snapHue((h - COMPANION_SHIFT + 360) % 360);
  return resolveAccent(toHex(hslToRgb(shifted, Math.max(s, 0.5), l)), theme);
};

/** CSS variables the accent drives; set on the root element, they override the stylesheet defaults. */
export const accentVars = (hex: string, theme: "dark" | "light"): Record<string, string> => {
  const { accent, fg } = resolveAccent(hex, theme);
  const second = resolveCompanion(hex, theme).accent;
  return {
    "--nx-accent": accent,
    "--nx-accent-fg": fg,
    "--nx-accent-soft": `${accent}22`,
    "--nx-accent-2": second,
    "--nx-zone": `${accent}0d`,
    "--nx-zone-line": `${accent}66`,
    "--nx-zone-2": `${second}0f`,
    "--nx-zone-line-2": `${second}77`,
    "--nx-aurora-glow": `${second}${theme === "dark" ? "3d" : "30"}`,
  };
};
