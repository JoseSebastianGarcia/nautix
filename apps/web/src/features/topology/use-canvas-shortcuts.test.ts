import { describe, expect, it } from "vitest";
import { shortcutFor } from "./use-canvas-shortcuts.js";

const key = (k: string, extra: Partial<Parameters<typeof shortcutFor>[0]> = {}) =>
  shortcutFor({ key: k, ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, ...extra });

describe("shortcutFor", () => {
  it("maps Ctrl+Delete, Ctrl+I and Ctrl+. / Ctrl+Esc", () => {
    expect(key("Delete")).toBe("remove");
    expect(key("I")).toBe("start");
    expect(key(".")).toBe("stop");
    expect(key("Escape")).toBe("stop");
  });

  it("accepts Cmd on a Mac", () => {
    expect(key("Backspace", { ctrlKey: false, metaKey: true })).toBe("remove");
  });

  it("ignores plain keys and other combinations", () => {
    expect(key("Delete", { ctrlKey: false })).toBeNull();
    expect(key("i", { altKey: true })).toBeNull();
    expect(key("i", { shiftKey: true })).toBeNull();
    expect(key("a")).toBeNull();
  });
});
