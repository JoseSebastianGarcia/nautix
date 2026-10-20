import type { CustomTemplateInput, Network, RestartPolicy, Template } from "@nautix/contracts";
import { Plus, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../app/api.js";
import { cli } from "../../app/cli.js";
import { keys, useContainers } from "../../app/queries.js";
import { useApiMutation } from "../../app/use-api-mutation.js";
import { EnvEditor, StringListEditor } from "../../components/fields.js";
import { Button, Dialog, Field, Input, ShowCommand } from "../../components/ui.js";
import {
  namedVolumes,
  randomizeSecrets,
  randomSecret,
  splitCommand,
  uniqueName,
} from "./deploy.js";
import { CUSTOM_TEMPLATE_ID } from "./palette.js";

export interface DeployTarget {
  template: Template | typeof CUSTOM_TEMPLATE_ID;
  /** null = outside every network box. */
  network: Network | null;
}

interface PortDraft {
  protocol: "tcp" | "udp";
  containerPort: string;
  hostPort: string;
  expose: boolean;
}

const validPort = (v: string): boolean => /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 65535;

export function DeployDialog({
  target,
  onClose,
}: {
  target: DeployTarget | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const name =
    target && typeof target.template !== "string" ? target.template.name : t("topology.anyImage");
  return (
    <Dialog open={target !== null} onClose={onClose} title={t("topology.deployTitle", { name })}>
      {target && (
        <DeployForm
          key={`${typeof target.template === "string" ? target.template : target.template.id}:${target.network?.id}`}
          target={target}
          onClose={onClose}
        />
      )}
    </Dialog>
  );
}

function DeployForm({ target, onClose }: { target: DeployTarget; onClose: () => void }) {
  const { t } = useTranslation();
  const { data: containers = [] } = useContainers();
  const tpl = target.template === CUSTOM_TEMPLATE_ID ? null : target.template;

  const [name, setName] = useState(() =>
    uniqueName(
      tpl?.id.replace(/^custom-/, "") ?? "app",
      containers.map((c) => c.name),
    ),
  );
  const [image, setImage] = useState(tpl?.image ?? "");
  // Templates are services; a free-form image may be a one-shot job (hello-world), so it defaults to "no".
  const [restart, setRestart] = useState<RestartPolicy>(tpl ? "unless-stopped" : "no");
  const [ports, setPorts] = useState<PortDraft[]>(() =>
    (tpl?.ports ?? []).map((p) => ({
      protocol: p.protocol ?? "tcp",
      containerPort: String(p.containerPort),
      hostPort: p.hostPort ? String(p.hostPort) : "",
      expose: false,
    })),
  );
  const [env, setEnv] = useState<[string, string][]>(() =>
    Object.entries(randomizeSecrets(tpl?.env ?? {}, randomSecret)),
  );
  const [volumes, setVolumes] = useState<string[]>(() => [...(tpl?.volumes ?? [])]);
  const [command, setCommand] = useState(() => tpl?.command?.join(" ") ?? "");
  const [saveAs, setSaveAs] = useState(false);
  const [templateName, setTemplateName] = useState(() => tpl?.name ?? "");

  const portsValid = ports.every(
    (p) => validPort(p.containerPort) && (p.hostPort === "" || validPort(p.hostPort)),
  );
  const canSubmit =
    name !== "" && image.trim() !== "" && portsValid && (!saveAs || templateName.trim() !== "");

  const deploy = useApiMutation(
    async () => {
      const created = await api.createContainer({
        name,
        image: image.trim(),
        networkId: target.network?.id ?? null,
        restartPolicy: restart,
        env: Object.fromEntries(env.filter(([k]) => k.trim() !== "")),
        ports: ports.map((p) => ({
          containerPort: Number(p.containerPort),
          protocol: p.protocol,
          ...(p.hostPort ? { hostPort: Number(p.hostPort) } : {}),
          exposePublicly: p.expose,
        })),
        volumes: namedVolumes(name, volumes),
        ...(command.trim() ? { command: splitCommand(command) } : {}),
      });
      if (saveAs) {
        const template: CustomTemplateInput = {
          name: templateName.trim(),
          image: image.trim(),
          description: "",
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
        await api.saveCustomTemplate(template);
      }
      return created;
    },
    [keys.containers, keys.networks, keys.images, keys.volumes, keys.catalog],
    () =>
      saveAs
        ? t("topology.templateSaved", { name: templateName.trim() })
        : t("toast.deployed", { name }),
    () => t("toast.deploying", { name }),
  );

  const command_ = cli.run({
    name,
    image,
    restart,
    ...(target.network ? { network: target.network.name } : {}),
    ports: ports.map((p) => ({
      ...(p.hostPort ? { host: Number(p.hostPort) } : {}),
      container: Number(p.containerPort) || 0,
      protocol: p.protocol,
      pub: p.expose,
    })),
  });

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit || deploy.isPending) return;
        // Pulling a large image can take minutes: keep working in the background, don't hold the dialog.
        deploy.mutate();
        onClose();
      }}
    >
      <p className="text-sm text-dim">
        {target.network
          ? t("topology.deployInto", { network: target.network.name })
          : t("topology.deployExternal")}
      </p>
      <Field label={t("topology.containerName")}>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          pattern="[a-zA-Z0-9][a-zA-Z0-9_.\-]*"
        />
      </Field>
      <Field label={t("topology.image")}>
        <Input
          value={image}
          onChange={(e) => setImage(e.target.value)}
          placeholder="nginx:1.27-alpine"
          required
          autoFocus={!tpl}
        />
      </Field>
      <Field label={t("topology.restartPolicy")} hint={t("topology.restartHint")}>
        <select
          aria-label={t("topology.restartPolicy")}
          value={restart}
          onChange={(e) => setRestart(e.target.value as RestartPolicy)}
          className="rounded-lg border border-line bg-bg0 px-2 py-2 text-sm text-fg"
        >
          {(["unless-stopped", "always", "on-failure", "no"] as const).map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </Field>

      <section className="flex flex-col gap-2">
        <h3 className="text-xs uppercase tracking-wider text-dim">{t("common.ports")}</h3>
        {ports.map((p, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional drafts
          <div key={i} className="flex flex-col gap-2 rounded-lg border border-line p-3">
            <div className="flex items-center gap-2">
              <Input
                className="min-w-0"
                aria-label={t("topology.containerPort")}
                aria-invalid={!validPort(p.containerPort)}
                inputMode="numeric"
                placeholder={t("topology.containerPort")}
                value={p.containerPort}
                onChange={(e) =>
                  setPorts(
                    ports.map((q, j) =>
                      j === i ? { ...q, containerPort: e.target.value.replace(/\D/g, "") } : q,
                    ),
                  )
                }
              />
              <select
                aria-label={t("topology.protocol")}
                value={p.protocol}
                onChange={(e) =>
                  setPorts(
                    ports.map((q, j) =>
                      j === i ? { ...q, protocol: e.target.value as "tcp" | "udp" } : q,
                    ),
                  )
                }
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
                onChange={(e) =>
                  setPorts(
                    ports.map((q, j) =>
                      j === i ? { ...q, hostPort: e.target.value.replace(/\D/g, "") } : q,
                    ),
                  )
                }
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
            <label className="flex items-center gap-2 text-xs text-dim">
              <input
                type="checkbox"
                checked={p.expose}
                onChange={(e) =>
                  setPorts(ports.map((q, j) => (j === i ? { ...q, expose: e.target.checked } : q)))
                }
              />
              {t("topology.exposePublicly")}
            </label>
            {p.expose && <p className="text-xs text-amber">{t("topology.exposeWarning")}</p>}
          </div>
        ))}
        {!portsValid && <p className="text-xs text-danger">{t("topology.invalidPort")}</p>}
        <Button
          onClick={() =>
            setPorts([
              ...ports,
              { protocol: "tcp", containerPort: "", hostPort: "", expose: false },
            ])
          }
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

      {!tpl?.custom && (
        <div className="flex flex-col gap-2 rounded-lg border border-line p-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={saveAs} onChange={(e) => setSaveAs(e.target.checked)} />
            {t("topology.saveTemplate")}
          </label>
          {saveAs && (
            <>
              <Input
                aria-label={t("topology.templateName")}
                placeholder={t("topology.templateName")}
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                maxLength={64}
              />
              <p className="text-xs text-amber">{t("topology.templateHint")}</p>
            </>
          )}
        </div>
      )}

      <ShowCommand command={command_} />
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>{t("common.cancel")}</Button>
        <Button variant="primary" type="submit" disabled={deploy.isPending || !canSubmit}>
          {deploy.isPending ? t("common.loading") : t("common.deploy")}
        </Button>
      </div>
    </form>
  );
}
