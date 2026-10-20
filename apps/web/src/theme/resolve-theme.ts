export type ThemeChoice = "dark" | "light" | "system";

export const resolveTheme = (choice: ThemeChoice, prefersDark: boolean): "dark" | "light" =>
  choice === "system" ? (prefersDark ? "dark" : "light") : choice;
