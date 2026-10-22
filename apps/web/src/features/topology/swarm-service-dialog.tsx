import type { Network, SwarmMount, SwarmNode, SwarmPlacement, Template } from "@nautix/contracts";
import { Plus, Trash2 } from "lucide-react";
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
  taken,
  onAdd,
  onClose,
}: {
  target: ServiceTarget | null;
  overlays: Network[];
  nodes: SwarmNode[];
  /** Secrets that exist in the swarm, by name. */
  secretNames: string[];
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
  taken,
  onAdd,
  onClose,
}: {
  target: ServiceTarget;
  overlays: Network[];
  nodes: SwarmNode[];
  secretNames: string[];
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

      <fieldset className="flex flex-col gap-2">
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

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm text-dim">{t("swarmCanvas.volumes")}</legend>
        {mounts.map((m, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: rows are edited in place and have no id
          <div key={i} className="flex items-center gap-2">
            <Input
              className="min-w-0"
              aria-label={t("swarmCanvas.volumeName")}
              placeholder={t("swarmCanvas.volumeName")}
              value={m.source}
              onChange={(e) =>
                setMounts(mounts.map((x, j) => (j === i ? { ...x, source: e.target.value } : x)))
              }
            />
            <Input
              className="min-w-0"
              aria-label={t("swarmCanvas.mountPath")}
              placeholder="/data"
              value={m.target}
              onChange={(e) =>
                setMounts(mounts.map((x, j) => (j === i ? { ...x, target: e.target.value } : x)))
              }
            />
            <button
              type="button"
              aria-label={t("common.delete")}
              className="rounded p-1.5 text-dim hover:text-danger"
              onClick={() => setMounts(mounts.filter((_, j) => j !== i))}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        <Button
          onClick={() =>
            setMounts([...mounts, { source: `${name}-data`, target: "/data", readOnly: false }])
          }
        >
          <Plus size={14} /> {t("swarmCanvas.addVolume")}
        </Button>
        {mounts.length > 0 && (
          <p className={`text-xs ${mode === "pin" ? "text-dim" : "text-amber"}`}>
            {mode === "pin" ? t("swarmCanvas.volumesPinned") : t("swarmCanvas.volumesNeedPin")}
          </p>
        )}
      </fieldset>

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

      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm text-dim">{t("swarmCanvas.secrets")}</legend>
        {secretNames.length === 0 ? (
          <p className="text-xs text-dim">{t("swarmCanvas.noSecrets")}</p>
        ) : (
          secretNames.map((s) => (
            <label key={s} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={secrets.includes(s)}
                onChange={(e) =>
                  setSecrets(e.target.checked ? [...secrets, s] : secrets.filter((x) => x !== s))
                }
              />
              <span className="font-mono">{s}</span>
              <span className="text-xs text-dim">/run/secrets/{s}</span>
            </label>
          ))
        )}
      </fieldset>

      <Field label={t("topology.environment")} hint={t("swarmCanvas.envHint")}>
        <textarea
          className="min-h-20 rounded-lg border border-line bg-bg0 px-3 py-2 font-mono text-xs"
          value={env}
          onChange={(e) => setEnv(e.target.value)}
          spellCheck={false}
        />
      </Field>
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>{t("common.cancel")}</Button>
        <Button type="submit" variant="primary" disabled={!valid}>
          {t("swarmCanvas.addToPlan")}
        </Button>
      </div>
    </form>
  );
}
