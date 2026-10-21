import { useTranslation } from "react-i18next";
import { ApiError } from "../app/api.js";

/** Why a recreating change was rolled back (with the new container's last log lines), or nothing. */
export function ApplyFailure({ error }: { error: unknown }) {
  const { t } = useTranslation();
  if (!(error instanceof ApiError) || error.hintKey !== "errors.applyUnhealthy") return null;
  return (
    <div role="alert" className="rounded-lg border border-danger p-3 text-xs">
      <p className="font-medium text-danger">{t("apply.rolledBack")}</p>
      {error.detail && (
        <pre className="mt-2 max-h-40 overflow-auto font-mono whitespace-pre-wrap text-dim">
          {error.detail}
        </pre>
      )}
    </div>
  );
}
