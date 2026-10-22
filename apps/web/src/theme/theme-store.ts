import { create } from "zustand";
import { accentVars, DEFAULT_ACCENT, parseHex } from "./accent.js";
import { resolveTheme, type ThemeChoice } from "./resolve-theme.js";

export type { ThemeChoice };

const KEY = "nautix.theme";
const ACCENT_KEY = "nautix.accent";
const GLASS_KEY = "nautix.glass";

const readKey = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const writeKey = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: the setting still applies for this session */
  }
};

const readChoice = (): ThemeChoice => {
  const v = readKey(KEY);
  return v === "dark" || v === "light" ? v : "system";
};
const readAccent = (): string => {
  const v = readKey(ACCENT_KEY);
  return v && parseHex(v) ? v : DEFAULT_ACCENT;
};

/** Edge refraction needs SVG filters inside backdrop-filter, which only Chromium renders. */
const supportsLens = (): boolean => /Chrome\//.test(navigator.userAgent);

interface ThemeState {
  choice: ThemeChoice;
  accent: string;
  /** True when the person asked for solid panels. */
  reduceTransparency: boolean;
  set: (choice: ThemeChoice) => void;
  setAccent: (hex: string) => void;
  setReduceTransparency: (on: boolean) => void;
}

const apply = (choice: ThemeChoice, accent: string, reduce: boolean): void => {
  const root = document.documentElement;
  const dark = matchMedia("(prefers-color-scheme: dark)").matches;
  const theme = resolveTheme(choice, dark);
  root.dataset.theme = theme;
  for (const [name, value] of Object.entries(accentVars(accent, theme)))
    root.style.setProperty(name, value);
  const systemReduces = matchMedia("(prefers-reduced-transparency: reduce)").matches;
  root.dataset.glass = reduce || systemReduces ? "off" : "on";
  root.dataset.lens = supportsLens() ? "on" : "off";
};

export const useTheme = create<ThemeState>((set, get) => ({
  choice: readChoice(),
  accent: readAccent(),
  reduceTransparency: readKey(GLASS_KEY) === "off",
  set: (choice) => {
    writeKey(KEY, choice);
    set({ choice });
    const s = get();
    apply(choice, s.accent, s.reduceTransparency);
  },
  setAccent: (accent) => {
    writeKey(ACCENT_KEY, accent);
    set({ accent });
    const s = get();
    apply(s.choice, accent, s.reduceTransparency);
  },
  setReduceTransparency: (reduceTransparency) => {
    writeKey(GLASS_KEY, reduceTransparency ? "off" : "on");
    set({ reduceTransparency });
    const s = get();
    apply(s.choice, s.accent, reduceTransparency);
  },
}));

const reapply = (): void => {
  const s = useTheme.getState();
  apply(s.choice, s.accent, s.reduceTransparency);
};
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (useTheme.getState().choice === "system") reapply();
});
matchMedia("(prefers-reduced-transparency: reduce)").addEventListener("change", reapply);
reapply();
