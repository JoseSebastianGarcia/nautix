import type { ComposeModel } from "@nautix/compose";
import { removeNetwork, setNetworkInternal } from "@nautix/compose";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, ConfirmDialog } from "../../components/ui.js";
import { DEFAULT_BOX } from "./compose-graph.js";
import type { Patch } from "./service-inspector.js";

export function ComposeNetworkInspector({
  name,
  model,
  onEdit,
  readOnly,
  onRemoved,
}: {
  name: string;
  model: ComposeModel;
  onEdit: (patch: Patch) => void;
  readOnly: boolean;
  onRemoved: () => void;
}) {
  const { t } = useTranslation();
  const [confirm, setConfirm] = useState(false);
  const network = model.networks.find((n) => n.name === name);
  const implicit = name === DEFAULT_BOX && !network;
  const members = model.services.filter((s) =>
    s.networks.length ? s.networks.includes(name) : name === DEFAULT_BOX,
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="font-semibold">{name}</div>
        <div className="font-mono text-xs text-dim">
          {network?.subnet ?? "—"} ·{" "}
          {network?.internal ? t("topology.isolated") : t("topology.bridged")}
        </div>
      </div>
      {implicit && <p className="text-sm text-dim">{t("compose.defaultBoxHint")}</p>}
      {network && (
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            disabled={readOnly}
            checked={network.internal}
            onChange={(e) => onEdit((d) => setNetworkInternal(d, name, e.target.checked))}
          />
          <span>
            {t("topology.internal")}
            <span className="block text-xs text-dim">{t("topology.internalHint")}</span>
          </span>
        </label>
      )}
      <ul className="flex flex-col gap-1">
        {members.map((s) => (
          <li key={s.name} className="rounded-lg bg-bg2 px-2 py-1 font-mono text-sm">
            {s.name}
          </li>
        ))}
      </ul>
      {network && !readOnly && (
        <Button variant="danger" onClick={() => setConfirm(true)}>
          <Trash2 size={14} /> {t("compose.removeNetwork")}
        </Button>
      )}
      <ConfirmDialog
        open={confirm}
        title={t("topology.removeNetworkTitle", { name })}
        body={t("compose.removeNetworkBody")}
        onConfirm={() => {
          onEdit((d) => removeNetwork(d, name));
          onRemoved();
        }}
        onClose={() => setConfirm(false)}
      />
    </div>
  );
}
