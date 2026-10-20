import { edit as patchText } from "@nautix/compose";
import type { Document } from "yaml";
import { create } from "zustand";
import { canRedo, canUndo, commit, type History, initialHistory, redo, undo } from "./history.js";

export type ComposeSelection =
  | { kind: "service"; name: string }
  | { kind: "network"; name: string }
  | null;

interface ComposeState {
  project: string | null;
  history: History;
  /** Text as last loaded from or saved to the server. */
  saved: string;
  selection: ComposeSelection;
  load: (project: string, text: string) => void;
  /** Raw text edits from the YAML editor (typing is coalesced into one undo step). */
  setText: (text: string) => void;
  /** Structured edit from the visual editor: patches the YAML, keeping comments and order. */
  edit: (patch: (doc: Document) => void) => void;
  undo: () => void;
  redo: () => void;
  markSaved: () => void;
  select: (selection: ComposeSelection) => void;
}

const TYPING_WINDOW_MS = 500;

export const useComposeStore = create<ComposeState>((set, get) => ({
  project: null,
  history: initialHistory(""),
  saved: "",
  selection: null,
  load: (project, text) =>
    set({ project, history: initialHistory(text), saved: text, selection: null }),
  setText: (text) =>
    set((s) => ({ history: commit(s.history, text, Date.now(), TYPING_WINDOW_MS) })),
  edit: (patch) => {
    const { history } = get();
    const next = patchText(history.present, patch);
    if (next !== history.present) set({ history: commit(history, next, Date.now()) });
  },
  undo: () => set((s) => ({ history: undo(s.history) })),
  redo: () => set((s) => ({ history: redo(s.history) })),
  markSaved: () => set((s) => ({ saved: s.history.present })),
  select: (selection) => set({ selection }),
}));

export const selectCanUndo = (s: ComposeState): boolean => canUndo(s.history);
export const selectCanRedo = (s: ComposeState): boolean => canRedo(s.history);
export const selectDirty = (s: ComposeState): boolean => s.history.present !== s.saved;
