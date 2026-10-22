import type {
  Network,
  SwarmHealthcheck,
  SwarmMount,
  SwarmNode,
  SwarmPlacement,
  SwarmResources,
  SwarmUpdatePolicy,
  Template,
} from "@nautix/contracts";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Dialog, Field, Input } from "../../components/ui.js";
import {
  formatEnv,
  namedVolumes,
  parseEnv,
  randomizeSecrets,
  randomSecret,
  uniqueName,
} from "./deploy.js";
import { CUSTOM_TEMPLATE_ID } from "./palette.js";
import type { PlannedCreate } from "./swarm-plan.js";
import {
  HealthcheckFields,
  MountsEditor,
  NameChecklist,
  PolicyFields,
  ResourcesFields,
} from "./swarm-settings-fields.js";

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

export type PlacementMode = "anywhere" | "workers" | "managers" | "pin";

const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "");

export const placementOf = (
  mode: PlacementMode,
  nodeId: string,
  maxPerNode: string,
): SwarmPlacement => ({
  ...(mode === "workers" ? { role: "worker" as const } : {}),
  ...(mode === "managers" ? { role: "manager" as const } : {}),
  ...(mode === "pin" && nodeId ? { nodeId } : {}),
  ...(Number(maxPerNode) >= 1 ? { maxPerNode: Math.floor(Number(maxPerNode)) } : {}),
});

/** "name:/path" pairs of a template's data paths, as editable volume mounts. */
const mountsFor = (container: string, paths: readonly string[]): SwarmMount[] =>
  namedVolumes(container, paths).flatMap((pair) => {
    const i = pair.indexOf(":");
    return i > 0 ? [{ source: pair.slice(0, i), target: pair.slice(i + 1), readOnly: false }] : [];
  });

export function SwarmServiceDialog({
  target,
  overlays,
  nodes,
  secretNames,
  configNames,
  taken,
  onAdd,
  onClose,
}: {
  target: ServiceTarget | null;
  overlays: Network[];
  nodes: SwarmNode[];
  /** Secrets that exist in the swarm, by name. */
  secretNames: string[];
  configNames: string[];
  /** Names already used by services or by changes in the plan. */
  taken: string[];
  onAdd: (item: PlannedCreate) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog
      open={target !== null}
      onClose={onClose}
      title={t("swarmCanvas.dialogTitle")}
      help="cluster"
    >
      {target && (
        <ServiceForm
          key={typeof target.template === "string" ? target.template : target.template.id}
          target={target}
          overlays={overlays}
          nodes={nodes}
          secretNames={secretNames}
          configNames={configNames}
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
  nodes,
  secretNames,
  configNames,
  taken,
  onAdd,
  onClose,
}: {
  target: ServiceTarget;
  overlays: Network[];
  nodes: SwarmNode[];
  secretNames: string[];
  configNames: string[];
  taken: string[];
  onAdd: (item: PlannedCreate) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const tpl = target.template === CUSTOM_TEMPLATE_ID ? null : target.template;
  const initialName = uniqueName(slug(tpl?.id ?? "service"), taken);
  const [name, setName] = useState(initialName);
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
  const [mounts, setMounts] = useState<SwarmMount[]>(() =>
    mountsFor(initialName, tpl?.volumes ?? []),
  );
  const [secrets, setSecrets] = useState<string[]>([]);
  const [configs, setConfigs] = useState<string[]>([]);
  const [health, setHealth] = useState<SwarmHealthcheck | null>(null);
  const [resources, setResources] = useState<SwarmResources>({});
  const [policy, setPolicy] = useState<SwarmUpdatePolicy>({
    failureAction: "rollback",
    parallelism: 1,
    delaySeconds: 5,
    monitorSeconds: 10,
  });
  // Data lives on the node where a copy runs, so a service with volumes starts pinned to a node.
  const home = nodes.find((n) => n.leader) ?? nodes[0];
  const [mode, setMode] = useState<PlacementMode>(mounts.length > 0 && home ? "pin" : "anywhere");
  const [nodeId, setNodeId] = useState(home?.id ?? "");
  const [maxPerNode, setMaxPerNode] = useState("");

  const nameValid = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,62}$/.test(name) && !taken.includes(name);
  const publishedValid = ports.every((p) => {
    if (p.published === "") return true;
    const n = Number(p.published);
    return Number.isInteger(n) && n >= 1 && n <= 65535;
  });
  const mountsValid = mounts.every(
    (m) => /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(m.source) && m.target.startsWith("/"),
  );
  const placement = placementOf(mode, nodeId, maxPerNode);
  const valid =
    nameValid &&
    image.trim() !== "" &&
    publishedValid &&
    mountsValid &&
    (health === null || health.command.trim() !== "") &&
    replicas >= 0 &&
    (mode !== "pin" || nodeId !== "");

  const submit = () =>
    onAdd({
      kind: "create",
      key: name,
      network: network || null,
      spec: {
        name,
        image: image.trim(),
        global,
        replicas,
        env: parseEnv(env),
        networks: network ? [network] : [],
        mounts,
        secrets,
        configs,
        ...(health ? { healthcheck: health } : {}),
        resources,
        update: policy,
        placement,
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

  const select = "rounded-lg border border-line bg-bg0 px-3 py-2 text-sm";
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
          <select className={select} value={network} onChange={(e) => setNetwork(e.target.value)}>
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

      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="text-sm text-dim">{t("swarmCanvas.placement")}</legend>
        <div className="grid grid-cols-2 gap-3">
          <select
            aria-label={t("swarmCanvas.placement")}
            className={select}
            value={mode}
            onChange={(e) => setMode(e.target.value as PlacementMode)}
          >
            {(["anywhere", "workers", "managers", "pin"] as const).map((m) => (
              <option key={m} value={m} disabled={m === "pin" && nodes.length === 0}>
                {t(`swarmCanvas.mode.${m}`)}
              </option>
            ))}
          </select>
          {mode === "pin" ? (
            <select
              aria-label={t("swarmCanvas.node")}
              className={select}
              value={nodeId}
              onChange={(e) => setNodeId(e.target.value)}
            >
              {nodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.hostname} ({t(`cluster.${n.role}`)})
                </option>
              ))}
            </select>
          ) : (
            <Input
              type="number"
              min={1}
              placeholder={t("swarmCanvas.maxPerNode")}
              aria-label={t("swarmCanvas.maxPerNode")}
              value={maxPerNode}
              onChange={(e) => setMaxPerNode(e.target.value)}
            />
          )}
        </div>
        <p className="text-xs text-dim">{t("swarmCanvas.placementHint")}</p>
      </fieldset>

      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="text-sm text-dim">{t("swarmCanvas.volumes")}</legend>
        <MountsEditor value={mounts} onChange={setMounts} defaultSource={`${name}-data`} />
        {mounts.length > 0 && (
          <p className={`text-xs ${mode === "pin" ? "text-dim" : "text-amber"}`}>
            {mode === "pin" ? t("swarmCanvas.volumesPinned") : t("swarmCanvas.volumesNeedPin")}
          </p>
        )}
      </fieldset>

      {ports.length > 0 && (
        <fieldset className="flex min-w-0 flex-col gap-2">
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

      <fieldset className="flex min-w-0 flex-col gap-1">
        <legend className="text-sm text-dim">{t("swarmCanvas.secrets")}</legend>
        <NameChecklist
          names={secretNames}
          selected={secrets}
          onChange={setSecrets}
          path={(n) => `/run/secrets/${n}`}
          empty={t("swarmCanvas.noSecrets")}
        />
      </fieldset>
      <fieldset className="flex min-w-0 flex-col gap-1">
        <legend className="text-sm text-dim">{t("swarmCanvas.configs")}</legend>
        <NameChecklist
          names={configNames}
          selected={configs}
          onChange={setConfigs}
          path={(n) => `/${n}`}
          empty={t("swarmCanvas.noConfigs")}
        />
      </fieldset>

      <Field label={t("topology.environment")} hint={t("swarmCanvas.envHint")}>
        <textarea
          className="min-h-20 rounded-lg border border-line bg-bg0 px-3 py-2 font-mono text-xs"
          value={env}
          onChange={(e) => setEnv(e.target.value)}
          spellCheck={false}
        />
      </Field>
      <details className="rounded-lg border border-line p-3 text-sm">
        <summary className="cursor-pointer select-none text-dim">
          {t("swarmCanvas.advanced")}
        </summary>
        <div className="mt-3 flex flex-col gap-4">
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">{t("swarmCanvas.healthTitle")}</h3>
            <p className="text-xs text-dim">{t("swarmCanvas.healthHint")}</p>
            <HealthcheckFields value={health} onChange={setHealth} />
          </section>
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">{t("swarmCanvas.resourcesTitle")}</h3>
            <p className="text-xs text-dim">{t("swarmCanvas.resourcesHint")}</p>
            <ResourcesFields value={resources} onChange={setResources} />
          </section>
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">{t("swarmCanvas.policyTitle")}</h3>
            <p className="text-xs text-dim">{t("swarmCanvas.policyHint")}</p>
            <PolicyFields value={policy} onChange={setPolicy} allowAuto />
          </section>
        </div>
      </details>
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>{t("common.cancel")}</Button>
        <Button type="submit" variant="primary" disabled={!valid}>
          {t("swarmCanvas.addToPlan")}
        </Button>
      </div>
    </form>
  );
}
