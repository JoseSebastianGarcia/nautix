import { CircleHelp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useHelp } from "./help-store.js";
import type { TopicId } from "./topics.js";

/** Small "?" that opens the help on one topic; put it next to anything that needs a second thought. */
export function HelpButton({ topic, size = 14 }: { topic: TopicId | null; size?: number }) {
  const { t } = useTranslation();
  const show = useHelp((s) => s.show);
  return (
    <button
      type="button"
      aria-label={t("help.open")}
      title={t("help.open")}
      className="text-dim hover:text-fg"
      onClick={() => show(topic)}
    >
      <CircleHelp size={size} />
    </button>
  );
}
