import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../app/api.js";
import { useToasts } from "../../components/toast-store.js";
import { Button, Dialog } from "../../components/ui.js";

export interface ExportTarget {
  networkId: string | undefined;
  /** Human label of the scope (network name, or undefined for everything). */
  label: string | undefined;
}

export function ExportDialog({
  target,
  onClose,
}: {
  target: ExportTarget | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={target !== null} onClose={onClose} title={t("topology.exportTitle")}>
      {target && <ExportBody target={target} onClose={onClose} />}
    </Dialog>
  );
}

function ExportBody({ target, onClose }: { target: ExportTarget; onClose: () => void }) {
  const { t } = useTranslation();
  const push = useToasts((s) => s.push);
  const [includeEnv, setIncludeEnv] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["export", target.networkId, includeEnv],
    queryFn: () => api.exportCompose(target.networkId, includeEnv),
    gcTime: 0,
  });
  const yaml = data?.yaml ?? "";

  const download = () => {
    const url = URL.createObjectURL(new Blob([yaml], { type: "text/yaml" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "compose.yaml";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-dim">
        {t("topology.exportScope", { scope: target.label ?? t("topology.exportAll") })}
      </p>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={includeEnv}
          onChange={(e) => setIncludeEnv(e.target.checked)}
        />
        <span>
          {t("topology.exportEnv")}
          <span className="block text-xs text-amber">{t("topology.exportEnvWarning")}</span>
        </span>
      </label>
      <pre className="max-h-80 overflow-auto rounded-lg border border-line bg-bg0 p-3 font-mono text-xs">
        {isLoading ? t("common.loading") : yaml}
      </pre>
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>{t("common.close")}</Button>
        <Button
          onClick={() => {
            void navigator.clipboard?.writeText(yaml);
            push("ok", t("common.copied"));
          }}
          disabled={!yaml}
        >
          {t("topology.exportCopy")}
        </Button>
        <Button variant="primary" onClick={download} disabled={!yaml}>
          {t("topology.exportDownload")}
        </Button>
      </div>
    </div>
  );
}
