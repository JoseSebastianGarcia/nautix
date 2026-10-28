import type { ComposeModel, ServiceModel } from "@nautix/compose";
import {
  isPublic,
  parsePort,
  removeService,
  renameService,
  setServiceEnv,
  setServiceList,
  setServiceScalar,
} from "@nautix/compose";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Document } from "yaml";
import { CheckList, CommitInput, EnvEditor, StringListEditor } from "../../components/fields.js";
import { Button, ConfirmDialog, Field } from "../../components/ui.js";
import { LogoBadge } from "../topology/logo-badge.js";

export type Patch = (doc: Document) => void;

const RESTART = ["", "no", "always", "unless-stopped", "on-failure"];
const NAME = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;

export function ServiceInspector({
  service: s,
  model,
  onEdit,
  readOnly,
  onRemoved,
}: {
  service: ServiceModel;
  model: ComposeModel;
  onEdit: (patch: Patch) => void;
  readOnly: boolean;
  onRemoved: () => void;
}) {
  const { t } = useTranslation();
  const [confirm, setConfirm] = useState(false);
  const others = model.services.filter((x) => x.name !== s.name).map((x) => x.name);
  const taken = new Set(model.services.map((x) => x.name));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <LogoBadge image={s.image ?? ""} name={s.name} />
        <div className="min-w-0 flex-1">
          <CommitInput
            label={t("compose.serviceName")}
            value={s.name}
            disabled={readOnly}
            validate={(v) => NAME.test(v) && (v === s.name || !taken.has(v))}
            onCommit={(v) => v && onEdit((d) => renameService(d, s.name, v))}
          />
        </div>
      </div>

      <Field label={t("common.image")}>
        <CommitInput
          label={t("common.image")}
          value={s.image ?? ""}
          disabled={readOnly}
          onCommit={(v) => onEdit((d) => setServiceScalar(d, s.name, "image", v))}
        />
      </Field>
      <Field label={t("compose.containerName")}>
        <CommitInput
          label={t("compose.containerName")}
          value={s.containerName ?? ""}
          disabled={readOnly}
          validate={(v) => NAME.test(v)}
          onCommit={(v) => onEdit((d) => setServiceScalar(d, s.name, "container_name", v))}
        />
      </Field>
      <Field label={t("compose.restart")}>
        <select
          aria-label={t("compose.restart")}
          disabled={readOnly}
          value={s.restart ?? ""}
          className="rounded-lg border border-line bg-bg0 px-2 py-2 text-sm text-fg"
          onChange={(e) => onEdit((d) => setServiceScalar(d, s.name, "restart", e.target.value))}
        >
          {RESTART.map((r) => (
            <option key={r} value={r}>
              {r || t("common.none")}
            </option>
          ))}
        </select>
      </Field>

      <StringListEditor
        label={t("common.ports")}
        items={s.ports}
        readOnly={readOnly}
        placeholder="127.0.0.1:8080:80"
        validate={(v) => parsePort(v) !== null}
        onChange={(items) => onEdit((d) => setServiceList(d, s.name, "ports", items))}
        hint={(item) => {
          const spec = parsePort(item);
          return spec && spec.host !== undefined && isPublic(spec) ? (
            <span className="text-xs text-amber">{t("compose.publicHint")}</span>
          ) : null;
        }}
      />
      <EnvEditor
        label={t("compose.environment")}
        entries={s.env}
        readOnly={readOnly}
        onChange={(entries) => onEdit((d) => setServiceEnv(d, s.name, entries))}
      />
      <StringListEditor
        label={t("compose.volumes")}
        items={s.volumes}
        readOnly={readOnly}
        placeholder="data:/var/lib/data"
        onChange={(items) => onEdit((d) => setServiceList(d, s.name, "volumes", items))}
      />
      <CheckList
        label={t("common.networks")}
        options={model.networks.map((n) => n.name)}
        selected={s.networks}
        readOnly={readOnly}
        empty={t("compose.noNetworks")}
        onChange={(names) => onEdit((d) => setServiceList(d, s.name, "networks", names))}
      />
      <CheckList
        label={t("compose.dependsOn")}
        options={others}
        selected={s.dependsOn}
        readOnly={readOnly}
        empty={t("common.none")}
        onChange={(names) => onEdit((d) => setServiceList(d, s.name, "depends_on", names))}
      />

      {!readOnly && (
        <Button variant="danger" onClick={() => setConfirm(true)}>
          <Trash2 size={14} /> {t("compose.removeService")}
        </Button>
      )}
      <ConfirmDialog
        open={confirm}
        title={t("compose.removeServiceTitle", { name: s.name })}
        confirmLabel={t("common.delete")}
        requireText={s.name}
        body={t("compose.removeServiceBody")}
        onConfirm={() => {
          onEdit((d) => removeService(d, s.name));
          onRemoved();
        }}
        onClose={() => setConfirm(false)}
      />
    </div>
  );
}
