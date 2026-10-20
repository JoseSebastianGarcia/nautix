/** Undo/redo over whole-text snapshots; the YAML text is the single source of truth. */
export interface History {
  past: string[];
  present: string;
  future: string[];
  /** Time of the last commit, used to coalesce rapid typing into one undo step. */
  lastAt: number;
}

const MAX = 200;

export const initialHistory = (text: string): History => ({
  past: [],
  present: text,
  future: [],
  lastAt: 0,
});

/** Records a new text. Edits within `coalesceMs` of the previous one replace it instead of stacking. */
export const commit = (h: History, text: string, now: number, coalesceMs = 0): History => {
  if (text === h.present) return h;
  const coalesce = coalesceMs > 0 && now - h.lastAt < coalesceMs && h.past.length > 0;
  return {
    past: coalesce ? h.past : [...h.past, h.present].slice(-MAX),
    present: text,
    future: [],
    lastAt: now,
  };
};

export const undo = (h: History): History => {
  const previous = h.past[h.past.length - 1];
  if (previous === undefined) return h;
  return {
    past: h.past.slice(0, -1),
    present: previous,
    future: [h.present, ...h.future],
    lastAt: 0,
  };
};

export const redo = (h: History): History => {
  const next = h.future[0];
  if (next === undefined) return h;
  return { past: [...h.past, h.present], present: next, future: h.future.slice(1), lastAt: 0 };
};

export const canUndo = (h: History): boolean => h.past.length > 0;
export const canRedo = (h: History): boolean => h.future.length > 0;
