import { HighlightStyle } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";

// Colors come from the same CSS tokens as the rest of the UI, so both themes just work.
export const theme = EditorView.theme({
  "&": {
    height: "100%",
    color: "var(--nx-text)",
    backgroundColor: "var(--nx-bg-0)",
    fontSize: "13px",
  },
  ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "1.55" },
  ".cm-content": { caretColor: "var(--nx-accent)" },
  ".cm-gutters": { backgroundColor: "var(--nx-bg-1)", color: "var(--nx-text-dim)", border: "none" },
  ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "var(--nx-accent-soft)" },
  "&.cm-focused": { outline: "2px solid var(--nx-accent)" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    backgroundColor: "var(--nx-accent-soft)",
  },
});

export const highlight = HighlightStyle.define([
  { tag: tags.comment, color: "var(--nx-text-dim)", fontStyle: "italic" },
  { tag: [tags.propertyName, tags.definition(tags.propertyName)], color: "var(--nx-accent)" },
  { tag: [tags.string, tags.content], color: "var(--nx-cyan)" },
  { tag: [tags.number, tags.bool, tags.null], color: "var(--nx-amber)" },
  { tag: [tags.keyword, tags.meta, tags.labelName], color: "var(--nx-danger)" },
]);
