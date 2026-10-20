import type { Issue } from "@nautix/compose";
import { AlertTriangle, CircleCheck, ShieldAlert, XCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

const ICON = {
  error: <XCircle size={14} className="shrink-0 text-danger" />,
  warning: <AlertTriangle size={14} className="shrink-0 text-amber" />,
  risk: <ShieldAlert size={14} className="shrink-0 text-danger" />,
};

export function IssuesPanel({
  issues,
  onSelect,
}: {
  issues: Issue[];
  onSelect: (service: string) => void;
}) {
  const { t } = useTranslation();
  if (issues.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-ok">
        <CircleCheck size={14} /> {t("compose.noIssues")}
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-1" aria-label={t("compose.issues")}>
      {issues.map((i, n) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: issues have no stable id
        <li key={n}>
          <button
            type="button"
            disabled={!i.service}
            onClick={() => i.service && onSelect(i.service)}
            className="flex w-full items-start gap-2 rounded-lg px-2 py-1 text-left text-sm hover:bg-bg2"
          >
            {ICON[i.level]}
            <span>
              {i.service && <span className="font-mono text-dim">{i.service}: </span>}
              {t(`compose.issue.${i.code}`, i.params)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
