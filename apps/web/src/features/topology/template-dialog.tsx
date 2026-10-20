import type { CustomTemplateInput, Template } from "@nautix/contracts";
import { Plus, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../app/api.js";
import { keys } from "../../app/queries.js";
import { useApiMutation } from "../../app/use-api-mutation.js";
import { EnvEditor, StringListEditor } from "../../components/fields.js";
import { Button, Dialog, Field, Input } from "../../components/ui.js";
import { joinCommand, splitCommand } from "./deploy.js";

interface PortDraft {
  protocol: "tcp" | "udp";
  containerPort: string;
  hostPort: string;
}

const validPort = (v: string): boolean => /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 65535;

/** `null` = closed, `"new"` = blank form, a template = edit it. */
export type TemplateTarget = Template | "new" | null;

export function TemplateDialog({
  target,
  onClose,
}: {
  target: TemplateTarget;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog
      open={target !== null}
      onClose={onClose}
      title={target === "new" ? t("topology.newTemplate") : t("topology.editTemplate")}
    >
      {target && (
        <TemplateForm
          key={target === "new" ? "new" : target.id}
          template={target === "new" ? null : target}
          onClose={onClose}
        />
      )}
    </Dialog>
  );
}

function TemplateForm({ template, onClose }: { template: Template | null; onClose: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState(template?.name ?? "");
  const [description, setDescription] = useState(
    template && template.description !== template.image ? template.description : "",
  );
  const [image, setImage] = useState(template?.image ?? "");
  const [ports, setPorts] = useState<PortDraft[]>(() =>
    (template?.ports ?? []).map((p) => ({
      protocol: p.protocol ?? "tcp",
      containerPort: String(p.containerPort),
      hostPort: p.hostPort ? String(p.hostPort) : "",
    })),
  );
  const [env, setEnv] = useState<[string, string][]>(() => Object.entries(template?.env ?? {}));
  const [volumes, setVolumes] = useState<string[]>(() => [...(template?.volumes ?? [])]);
  const [command, setCommand] = useState(() =>
    template?.command ? joinCommand(template.command) : "",
  );

  const portsValid = ports.every(
    (p) => validPort(p.containerPort) && (p.hostPort === "" || validPort(p.hostPort)),
  );
  const canSave = name.trim() !== "" && image.trim() !== "" && portsValid;
  const patchPort = (i: number, patch: Partial<PortDraft>) =>
    setPorts(ports.map((q, j) => (j === i ? { ...q, ...patch } : q)));

  const save = useApiMutation(
    async () => {
      const input: CustomTemplateInput = {
        name: name.trim(),
        image: image.trim(),
        description: description.trim(),
        ports: ports.map((p) => ({
          containerPort: Number(p.containerPort),
          label: "",
          protocol: p.protocol,
          ...(p.hostPort ? { hostPort: Number(p.hostPort) } : {}),
        })),
        env: Object.fromEntries(env.filter(([k]) => k.trim() !== "")),
        volumes,
        ...(command.trim() ? { command: splitCommand(command) } : {}),
      };
      const saved = await api.saveCustomTemplate(input);
      // Renaming changes the id (it derives from the name): drop the old entry.
      if (template && saved.id !== template.id) await api.deleteCustomTemplate(template.id);
      return saved;
    },
    [keys.catalog],
    () => t("topology.templateSaved", { name: name.trim() }),
  );

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSave || save.isPending) return;
        save.mutate(undefined, { onSuccess: onClose });
      }}
    >
      <p className="text-xs text-dim">{t("topology.templateIntro")}</p>
      <Field label={t("topology.templateName")}>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={64}
          autoFocus
        />
      </Field>
      <Field label={t("topology.image")}>
        <Input
          value={image}
          onChange={(e) => setImage(e.target.value)}
          placeholder="nginx:1.27-alpine"
          required
        />
      </Field>
      <Field label={t("topology.templateDescription")}>
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={200}
        />
      </Field>

      <section className="flex flex-col gap-2">
        <h3 className="text-xs uppercase tracking-wider text-dim">{t("common.ports")}</h3>
        {ports.map((p, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional drafts
          <div key={i} className="flex items-center gap-2">
            <Input
              className="min-w-0"
              aria-label={t("topology.containerPort")}
              aria-invalid={!validPort(p.containerPort)}
              inputMode="numeric"
              placeholder={t("topology.containerPort")}
              value={p.containerPort}
              onChange={(e) => patchPort(i, { containerPort: e.target.value.replace(/\D/g, "") })}
            />
            <select
              aria-label={t("topology.protocol")}
              value={p.protocol}
              onChange={(e) => patchPort(i, { protocol: e.target.value as "tcp" | "udp" })}
              className="rounded-lg border border-line bg-bg0 px-1 py-2 text-xs text-fg"
            >
              <option value="tcp">tcp</option>
              <option value="udp">udp</option>
            </select>
            <span className="text-dim">→</span>
            <Input
              className="min-w-0"
              aria-label={t("topology.hostPort")}
              aria-invalid={p.hostPort !== "" && !validPort(p.hostPort)}
              inputMode="numeric"
              placeholder={`${t("topology.hostPortShort")} (${t("topology.hostPortAuto")})`}
              value={p.hostPort}
              onChange={(e) => patchPort(i, { hostPort: e.target.value.replace(/\D/g, "") })}
            />
            <button
              type="button"
              aria-label={`${t("topology.remove")} ${p.containerPort}`}
              className="text-dim hover:text-danger"
              onClick={() => setPorts(ports.filter((_, j) => j !== i))}
            >
              <X size={14} />
            </button>
          </div>
        ))}
        {!portsValid && <p className="text-xs text-danger">{t("topology.invalidPort")}</p>}
        <Button
          onClick={() => setPorts([...ports, { protocol: "tcp", containerPort: "", hostPort: "" }])}
        >
          <Plus size={14} /> {t("topology.addPort")}
        </Button>
      </section>

      <EnvEditor label={t("topology.environment")} entries={env} onChange={setEnv} />
      <StringListEditor
        label={t("topology.volumesPaths")}
        items={volumes}
        placeholder="/var/lib/data"
        validate={(v) => v.startsWith("/")}
        onChange={setVolumes}
      />
      <Field label={t("topology.command")} hint={t("topology.commandHint")}>
        <Input
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder="--flag value"
        />
      </Field>
      <p className="text-xs text-amber">{t("topology.templateHint")}</p>
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>{t("common.cancel")}</Button>
        <Button variant="primary" type="submit" disabled={save.isPending || !canSave}>
          {t("common.save")}
        </Button>
      </div>
    </form>
  );
}
