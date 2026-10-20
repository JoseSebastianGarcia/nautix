import { defaultKeymap, indentWithTab } from "@codemirror/commands";
import { yaml } from "@codemirror/lang-yaml";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { useEffect, useRef } from "react";

// Colors come from the same CSS tokens as the rest of the UI, so both themes just work.
const theme = EditorView.theme({
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

const highlight = HighlightStyle.define([
  { tag: tags.comment, color: "var(--nx-text-dim)", fontStyle: "italic" },
  { tag: [tags.propertyName, tags.definition(tags.propertyName)], color: "var(--nx-accent)" },
  { tag: [tags.string, tags.content], color: "var(--nx-cyan)" },
  { tag: [tags.number, tags.bool, tags.null], color: "var(--nx-amber)" },
  { tag: [tags.keyword, tags.meta, tags.labelName], color: "var(--nx-danger)" },
]);

interface Props {
  value: string;
  onChange: (value: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  readOnly?: boolean;
  label: string;
}

/** CodeMirror 6 bound to the editor store. Undo/redo are the store's, so visual and text edits share one history. */
export function YamlEditor({
  value,
  onChange,
  onUndo,
  onRedo,
  onSave,
  readOnly = false,
  label,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const callbacks = useRef({ onChange, onUndo, onRedo, onSave });
  callbacks.current = { onChange, onUndo, onRedo, onSave };

  // biome-ignore lint/correctness/useExhaustiveDependencies: the editor is created once; value is synced below
  useEffect(() => {
    if (!host.current) return;
    const v = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          highlightActiveLine(),
          drawSelection(),
          yaml(),
          syntaxHighlighting(highlight),
          theme,
          EditorState.readOnly.of(readOnly),
          EditorView.contentAttributes.of({ "aria-label": label }),
          keymap.of([
            { key: "Mod-z", run: () => (callbacks.current.onUndo(), true) },
            { key: "Mod-y", run: () => (callbacks.current.onRedo(), true) },
            { key: "Mod-Shift-z", run: () => (callbacks.current.onRedo(), true) },
            { key: "Mod-s", run: () => (callbacks.current.onSave(), true) },
            indentWithTab,
            ...defaultKeymap,
          ]),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) callbacks.current.onChange(u.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = v;
    return () => v.destroy();
  }, [readOnly, label]);

  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value) {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
    }
  }, [value]);

  return <div ref={host} className="h-full overflow-hidden rounded-xl border border-line" />;
}
