import type { Network, Template } from "@nautix/contracts";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../app/api.js";
import { cli } from "../../app/cli.js";
import { keys, useContainers } from "../../app/queries.js";
import { useApiMutation } from "../../app/use-api-mutation.js";
import { Button, Dialog, Field, Input, ShowCommand } from "../../components/ui.js";
import { formatEnv, parseEnv, randomizeSecrets, randomSecret, uniqueName } from "./deploy.js";
import { CUSTOM_TEMPLATE_ID } from "./palette.js";

export interface DeployTarget {
  template: Template | typeof CUSTOM_TEMPLATE_ID;
  /** null = outside every network box. */
  network: Network | null;
}

interface PortDraft {
  containerPort: number;
  label: string;
  hostPort: string;
  expose: boolean;
}

export function DeployDialog({
  target,
  onClose,
}: {
  target: DeployTarget | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const name =
    target && typeof target.template !== "string" ? target.template.name : t("common.image");
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
      tpl?.id ?? "app",
      containers.map((c) => c.name),
    ),
  );
  const [image, setImage] = useState(tpl?.image ?? "");
  const [env, setEnv] = useState(() => formatEnv(randomizeSecrets(tpl?.env ?? {}, randomSecret)));
  const [ports, setPorts] = useState<PortDraft[]>(() =>
    (tpl?.ports ?? []).map((p) => ({
      containerPort: p.containerPort,
      label: p.label,
      hostPort: "",
      expose: false,
    })),
  );

  const deploy = useApiMutation(
    () =>
      api.createContainer({
        name,
        image,
        networkId: target.network?.id ?? null,
        env: parseEnv(env),
        ports: ports.map((p) => ({
          containerPort: p.containerPort,
          ...(p.hostPort ? { hostPort: Number(p.hostPort) } : {}),
          exposePublicly: p.expose,
        })),
        ...(tpl?.volumes ? { volumes: tpl.volumes } : {}),
        ...(tpl?.command ? { command: tpl.command } : {}),
      }),
    [keys.containers, keys.networks, keys.images],
    () => t("toast.deployed", { name }),
  );

  const command = cli.run({
    name,
    image,
    ...(target.network ? { network: target.network.name } : {}),
    ports: ports.map((p) => ({
      ...(p.hostPort ? { host: Number(p.hostPort) } : {}),
      container: p.containerPort,
      pub: p.expose,
    })),
  });

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        deploy.mutate(undefined, { onSuccess: onClose });
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
      <Field label={t("common.image")}>
        <Input value={image} onChange={(e) => setImage(e.target.value)} required />
      </Field>
      {ports.map((p, i) => (
        <div
          key={p.containerPort}
          className="flex flex-col gap-2 rounded-lg border border-line p-3"
        >
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm">
              {p.label} · {p.containerPort}
            </span>
            <Input
              className="ml-auto w-28"
              inputMode="numeric"
              aria-label={t("topology.hostPort")}
              placeholder={t("topology.hostPortAuto")}
              value={p.hostPort}
              onChange={(e) =>
                setPorts(
                  ports.map((q, j) =>
                    j === i ? { ...q, hostPort: e.target.value.replace(/\D/g, "") } : q,
                  ),
                )
              }
            />
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
      {tpl?.env && (
        <Field label="ENV">
          <textarea
            className="min-h-20 rounded-lg border border-line bg-bg0 p-2 font-mono text-xs"
            value={env}
            onChange={(e) => setEnv(e.target.value)}
          />
        </Field>
      )}
      <ShowCommand command={command} />
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>{t("common.cancel")}</Button>
        <Button variant="primary" type="submit" disabled={deploy.isPending}>
          {deploy.isPending ? t("common.loading") : t("common.deploy")}
        </Button>
      </div>
    </form>
  );
}
