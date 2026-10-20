import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { JsonTree } from "../features/containers/json-tree.js";
import { Button, Dialog, Input, ShowCommand } from "./ui.js";

/** `docker inspect` for any object: tree with search and copy-path, or raw JSON. */
export function InspectDialog({
  target,
  onClose,
}: {
  target: { title: string; command: string; key: string; load: () => Promise<unknown> } | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={target !== null} onClose={onClose} title={target?.title ?? ""}>
      {target && <Body target={target} onClose={onClose} />}
    </Dialog>
  );
}

function Body({
  target,
  onClose,
}: {
  target: { command: string; key: string; load: () => Promise<unknown> };
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState("");
  const [raw, setRaw] = useState(false);
  const data = useQuery({
    queryKey: ["inspect-dialog", target.key],
    queryFn: target.load,
    gcTime: 0,
  });
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Input
          aria-label={t("details.search")}
          placeholder={t("details.search")}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <label className="flex shrink-0 items-center gap-2 text-sm">
          <input type="checkbox" checked={raw} onChange={(e) => setRaw(e.target.checked)} />
          {t("details.rawJson")}
        </label>
      </div>
      <div className="max-h-[55vh] overflow-auto rounded-lg border border-line bg-bg0 p-3">
        {data.isLoading ? (
          <p className="text-sm text-dim">{t("common.loading")}</p>
        ) : raw ? (
          <pre className="font-mono text-xs whitespace-pre-wrap">
            {JSON.stringify(data.data, null, 2)}
          </pre>
        ) : (
          <JsonTree value={data.data} filter={filter} />
        )}
      </div>
      <ShowCommand command={target.command} />
      <div className="flex justify-end">
        <Button onClick={onClose}>{t("common.close")}</Button>
      </div>
    </div>
  );
}
