import type { Network, Template } from "@nautix/contracts";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Dialog, Field, Input } from "../../components/ui.js";
import { formatEnv, parseEnv, randomizeSecrets, randomSecret, uniqueName } from "./deploy.js";
import { CUSTOM_TEMPLATE_ID } from "./palette.js";
import type { PlannedCreate } from "./swarm-plan.js";

export interface ServiceTarget {
  template: Template | typeof CUSTOM_TEMPLATE_ID;
  /** Overlay it was dropped on. */
  network: Network | null;
}

interface PortDraft {
  target: number;
  label: string;
  protocol: "tcp" | "udp";
  /** Empty = not published: reachable by the other services of the network only. */
  published: string;
}

const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "");

export function SwarmServiceDialog({
  target,
  overlays,
  taken,
  onAdd,
  onClose,
}: {
  target: ServiceTarget | null;
  overlays: Network[];
  /** Names already used by services or by changes in the plan. */
  taken: string[];
  onAdd: (item: PlannedCreate) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={target !== null} onClose={onClose} title={t("swarmCanvas.dialogTitle")}>
      {target && (
        <ServiceForm
          key={typeof target.template === "string" ? target.template : target.template.id}
          target={target}
          overlays={overlays}
          taken={taken}
          onAdd={(item) => {
            onAdd(item);
            onClose();
          }}
          onClose={onClose}
        />
      )}
    </Dialog>
  );
}

function ServiceForm({
  target,
  overlays,
  taken,
  onAdd,
  onClose,
}: {
  target: ServiceTarget;
  overlays: Network[];
  taken: string[];
  onAdd: (item: PlannedCreate) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const tpl = target.template === CUSTOM_TEMPLATE_ID ? null : target.template;
  const [name, setName] = useState(() => uniqueName(slug(tpl?.id ?? "service"), taken));
  const [image, setImage] = useState(tpl?.image ?? "");
  const [global, setGlobal] = useState(false);
  const [replicas, setReplicas] = useState(1);
  const [network, setNetwork] = useState(target.network?.name ?? overlays[0]?.name ?? "");
  const [ports, setPorts] = useState<PortDraft[]>(() =>
    (tpl?.ports ?? []).map((p) => ({
      target: p.containerPort,
      label: p.label,
      protocol: p.protocol ?? "tcp",
      published: "",
    })),
  );
  const [env, setEnv] = useState(() => formatEnv(randomizeSecrets(tpl?.env ?? {}, randomSecret)));

  const nameValid = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,62}$/.test(name) && !taken.includes(name);
  const publishedValid = ports.every((p) => {
    if (p.published === "") return true;
    const n = Number(p.published);
    return Number.isInteger(n) && n >= 1 && n <= 65535;
  });
  const valid = nameValid && image.trim() !== "" && publishedValid && replicas >= 0;

  const submit = () =>
    onAdd({
      kind: "create",
      key: name,
      network: network || null,
      droppedVolumes: (tpl?.volumes?.length ?? 0) > 0,
      spec: {
        name,
        image: image.trim(),
        global,
        replicas,
        env: parseEnv(env),
        networks: network ? [network] : [],
        ports: ports
          .filter((p) => p.published !== "")
          .map((p) => ({
            target: p.target,
            published: Number(p.published),
            protocol: p.protocol,
          })),
        ...(tpl?.command ? { command: tpl.command } : {}),
      },
    });

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) submit();
      }}
    >
      <p className="text-sm text-dim">{t("swarmCanvas.dialogHint")}</p>
      <Field label={t("common.name")}>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      {!nameValid && name !== "" && (
        <p className="text-xs text-danger">{t("swarmCanvas.nameTaken")}</p>
      )}
      <Field label={t("common.image")}>
        <Input value={image} onChange={(e) => setImage(e.target.value)} placeholder="nginx:1.27" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("swarmCanvas.copies")}>
          <Input
            type="number"
            min={0}
            max={1000}
            disabled={global}
            value={replicas}
            onChange={(e) => setReplicas(Math.max(0, Number(e.target.value) || 0))}
          />
        </Field>
        <Field label={t("cluster.networks")}>
          <select
            className="rounded-lg border border-line bg-bg0 px-3 py-2 text-sm"
            value={network}
            onChange={(e) => setNetwork(e.target.value)}
          >
            <option value="">{t("cluster.loose")}</option>
            {overlays.map((n) => (
              <option key={n.id} value={n.name}>
                {n.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={global} onChange={(e) => setGlobal(e.target.checked)} />
        {t("swarmCanvas.global")}
      </label>
      {ports.length > 0 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm text-dim">{t("common.ports")}</legend>
          <p className="text-xs text-dim">{t("swarmCanvas.portsHint")}</p>
          {ports.map((p, i) => (
            <div key={`${p.target}/${p.protocol}`} className="flex items-center gap-2 text-sm">
              <span className="w-28 font-mono">
                {p.target}/{p.protocol}
              </span>
              <span className="text-dim">{p.label}</span>
              <Input
                className="ml-auto w-40"
                inputMode="numeric"
                placeholder={t("swarmCanvas.notPublished")}
                aria-label={`${t("swarmCanvas.publishAs")} ${p.target}`}
                value={p.published}
                onChange={(e) =>
                  setPorts(ports.map((q, j) => (j === i ? { ...q, published: e.target.value } : q)))
                }
              />
            </div>
          ))}
          {ports.some((p) => p.published !== "") && (
            <p className="text-xs text-amber">{t("swarmCanvas.publishedWarn")}</p>
          )}
        </fieldset>
      )}
      <Field label={t("topology.environment")} hint={t("swarmCanvas.envHint")}>
        <textarea
          className="min-h-20 rounded-lg border border-line bg-bg0 px-3 py-2 font-mono text-xs"
          value={env}
          onChange={(e) => setEnv(e.target.value)}
          spellCheck={false}
        />
      </Field>
      {(tpl?.volumes?.length ?? 0) > 0 && (
        <p className="rounded-lg border border-amber p-2 text-xs text-amber">
          {t("swarmCanvas.volumesDropped")}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>{t("common.cancel")}</Button>
        <Button type="submit" variant="primary" disabled={!valid}>
          {t("swarmCanvas.addToPlan")}
        </Button>
      </div>
    </form>
  );
}
