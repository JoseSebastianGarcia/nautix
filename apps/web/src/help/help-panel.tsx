import { ArrowLeft, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { useHelp } from "./help-store.js";
import { MarkdownView } from "./markdown-view.js";
import { loadTopic, searchTopics, TOPIC_IDS, topicForPath } from "./topics.js";

/** Side panel with the help; opens on the topic of the page the user is on. */
export function HelpPanel() {
  const { t, i18n } = useTranslation();
  const { open, topic, show, close } = useHelp();
  const { pathname } = useLocation();
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  const current = topic ? loadTopic(topic, i18n.language) : null;
  const here = loadTopic(topicForPath(pathname), i18n.language);
  const results = query.trim() ? searchTopics(i18n.language, query) : null;
  const list = results ?? TOPIC_IDS.map((id) => loadTopic(id, i18n.language));

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: clicking the backdrop is a mouse shortcut; Esc and the close button do the same
    <dialog
      ref={ref}
      aria-label={t("help.title")}
      onClose={close}
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
      className="fixed inset-y-0 right-0 left-auto m-0 h-full max-h-none w-[min(32rem,100vw)] max-w-none overflow-y-auto rounded-none border-l border-line bg-bg1 p-0 text-fg backdrop:bg-black/40"
    >
      {open && (
        <div className="flex flex-col gap-4 p-5">
          <div className="flex items-center gap-2">
            {current && (
              <button
                type="button"
                aria-label={t("help.allTopics")}
                title={t("help.allTopics")}
                className="text-dim hover:text-fg"
                onClick={() => show(null)}
              >
                <ArrowLeft size={16} />
              </button>
            )}
            <h1 className="text-base font-semibold">{t("help.title")}</h1>
            <button
              type="button"
              aria-label={t("common.close")}
              title={t("common.close")}
              className="ml-auto text-dim hover:text-fg"
              onClick={close}
            >
              <X size={16} />
            </button>
          </div>
          {current ? (
            <MarkdownView blocks={current.blocks} />
          ) : (
            <>
              <label className="relative block">
                <span className="sr-only">{t("help.search")}</span>
                <Search size={14} className="absolute top-2.5 left-3 text-dim" aria-hidden="true" />
                <input
                  type="search"
                  value={query}
                  placeholder={t("help.search")}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full rounded-lg border border-line bg-bg0 py-2 pr-3 pl-9 text-sm text-fg placeholder:text-dim"
                />
              </label>
              {!query.trim() && (
                <button
                  type="button"
                  className="rounded-lg border border-line bg-accent-soft p-3 text-left text-sm hover:bg-bg2"
                  onClick={() => show(here.id)}
                >
                  <span className="block text-xs text-dim">{t("help.thisPage")}</span>
                  <span className="font-medium text-accent">{here.title}</span>
                </button>
              )}
              {list.length === 0 ? (
                <p className="text-sm text-dim">{t("help.noResults")}</p>
              ) : (
                <ul className="flex flex-col">
                  {list.map((topic) => (
                    <li key={topic.id}>
                      <button
                        type="button"
                        className="w-full border-b border-line px-1 py-2.5 text-left text-sm hover:text-accent"
                        onClick={() => show(topic.id)}
                      >
                        {topic.title}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </dialog>
  );
}
