import { useEffect, useRef } from "react";

export interface CanvasShortcuts {
  /** Ctrl+Delete: ask to remove what is selected. */
  remove?: (() => void) | undefined;
  /** Ctrl+I: start it. */
  start?: (() => void) | undefined;
  /** Ctrl+Esc or Ctrl+.: stop it (Windows keeps Ctrl+Esc for the Start menu, so the dot is the reliable one). */
  stop?: (() => void) | undefined;
}

const typing = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

type Combo = Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">;

/** Which action a key combination asks for, if any. */
export function shortcutFor(e: Combo): keyof CanvasShortcuts | null {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return null;
  const key = e.key.toLowerCase();
  if (key === "delete" || key === "backspace") return "remove";
  if (key === "i" && !e.shiftKey) return "start";
  if (key === "escape" || key === ".") return "stop";
  return null;
}

/** Keyboard shortcuts for the selection of a canvas; silent while typing or while a dialog is open. */
export function useCanvasShortcuts(handlers: CanvasShortcuts): void {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const name = shortcutFor(e);
      if (!name || typing(e.target) || document.querySelector("dialog[open]")) return;
      const action = ref.current[name];
      if (!action) return;
      e.preventDefault();
      action();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
