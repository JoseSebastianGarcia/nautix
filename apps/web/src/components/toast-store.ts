import { create } from "zustand";

export interface Toast {
  id: number;
  kind: "ok" | "error" | "pending";
  text: string;
}

interface ToastState {
  toasts: Toast[];
  /** Returns the toast id. `ok`/`error` fade out by themselves; `pending` stays until dismissed. */
  push: (kind: Toast["kind"], text: string) => number;
  dismiss: (id: number) => void;
}

let next = 1;

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (kind, text) => {
    const id = next++;
    set((s) => ({ toasts: [...s.toasts, { id, kind, text }] }));
    if (kind !== "pending") {
      setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4500);
    }
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
