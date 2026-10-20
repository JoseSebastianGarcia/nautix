import { create } from "zustand";

import { resolveTheme, type ThemeChoice } from "./resolve-theme.js";

export type { ThemeChoice };

const KEY = "nautix.theme";

const read = (): ThemeChoice => {
  try {
    const v = localStorage.getItem(KEY);
    return v === "dark" || v === "light" ? v : "system";
  } catch {
    return "system";
  }
};

const apply = (choice: ThemeChoice): void => {
  const dark = matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.theme = resolveTheme(choice, dark);
};

interface ThemeState {
  choice: ThemeChoice;
  set: (choice: ThemeChoice) => void;
}

export const useTheme = create<ThemeState>((set) => ({
  choice: read(),
  set: (choice) => {
    try {
      localStorage.setItem(KEY, choice);
    } catch {
      /* storage unavailable: theme still applies for this session */
    }
    apply(choice);
    set({ choice });
  },
}));

matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (useTheme.getState().choice === "system") apply("system");
});
