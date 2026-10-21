import { create } from "zustand";
import type { TopicId } from "./topics.js";

interface HelpState {
  open: boolean;
  /** The topic being read; null shows the list. */
  topic: TopicId | null;
  show: (topic: TopicId | null) => void;
  close: () => void;
}

export const useHelp = create<HelpState>((set) => ({
  open: false,
  topic: null,
  show: (topic) => set({ open: true, topic }),
  close: () => set({ open: false }),
}));
