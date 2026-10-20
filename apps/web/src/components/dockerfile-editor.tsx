import { defaultKeymap, indentWithTab } from "@codemirror/commands";
import { StreamLanguage, syntaxHighlighting } from "@codemirror/language";
import { dockerFile } from "@codemirror/legacy-modes/mode/dockerfile";
import { EditorState } from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { useEffect, useRef } from "react";
import { highlight, theme } from "./code-theme.js";

interface Props {
  value: string;
  onChange: (value: string) => void;
  label: string;
  /** Called with the editor so the page can move the cursor to a lint issue. */
  onReady?: (view: EditorView) => void;
}

/** CodeMirror 6 with Dockerfile highlighting; colors come from the shared theme tokens. */
export function DockerfileEditor({ value, onChange, label, onReady }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const callbacks = useRef({ onChange, onReady });
  callbacks.current = { onChange, onReady };

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
          StreamLanguage.define(dockerFile),
          syntaxHighlighting(highlight),
          theme,
          EditorView.contentAttributes.of({ "aria-label": label }),
          keymap.of([indentWithTab, ...defaultKeymap]),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) callbacks.current.onChange(u.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = v;
    callbacks.current.onReady?.(v);
    return () => v.destroy();
  }, [label]);

  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value)
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
  }, [value]);

  return <div ref={host} className="h-full overflow-hidden rounded-xl border border-line" />;
}
