import type { SwarmItem, SwarmNode, SwarmService } from "@nautix/contracts";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, api } from "../../app/api.js";
import { useApiMutation } from "../../app/use-api-mutation.js";
import { EnvEditor } from "../../components/fields.js";
import { Button, ConfirmDialog, Dialog, Field, Input } from "../../components/ui.js";
import { PageHeader, Table, Td } from "../resources/table.js";
import { LeaveSwarmDialog } from "./leave-dialog.js";
import { SwarmConnect } from "./swarm-connect.js";

const SWARM = ["swarm"];
const TABS = ["services", "nodes", "stacks", "secrets", "configs", "cluster"] as const;
type Tab = (typeof TABS)[number];

export function SwarmPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("services");
  const status = useQuery({ queryKey: SWARM, queryFn: api.swarm, refetchInterval: 15_000 });

  if (!status.data) return <div className="p-6 text-dim">{t("common.loading")}</div>;
  if (!status.data.active) return <Setup />;
  if (status.data.locked) return <Locked />;
  if (!status.data.isManager) return <p className="p-6 text-dim">{t("swarm.notManager")}</p>;

  return (
    <div className="flex flex-col gap-4 p-6">
      <PageHeader title={t("swarm.title")} />
      <div role="tablist" className="flex w-fit rounded-lg border border-line p-0.5 text-sm">
        {TABS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`rounded-md px-3 py-1 ${tab === id ? "bg-accent-soft text-accent" : "text-dim hover:text-fg"}`}
          >
            {t(`swarm.tab.${id}`)}
          </button>
        ))}
      </div>
      {tab === "services" && <Services />}
      {tab === "nodes" && <Nodes />}
      {tab === "stacks" && <Stacks />}
      {tab === "secrets" && <Items kind="secret" />}
      {tab === "configs" && <Items kind="config" />}
      {tab === "cluster" && <Cluster />}
    </div>
  );
}

function Setup() {
  const { t } = useTranslation();
  return (
    <div className="flex max-w-xl flex-col gap-6 p-6">
      <PageHeader title={t("swarm.title")} />
      <SwarmConnect />
    </div>
  );
}

function Locked() {
  const { t } = useTranslation();
  const [key, setKey] = useState("");
  const unlock = useApiMutation(
    () => api.swarmUnlock(key),
    [SWARM],
    () => t("swarm.unlocked"),
  );
  return (
    <div className="flex max-w-xl flex-col gap-3 p-6">
      <PageHeader title={t("swarm.title")} />
      <p className="text-sm text-amber">{t("swarm.locked")}</p>
      <Input
        type="password"
        autoComplete="off"
        value={key}
        onChange={(e) => setKey(e.target.value)}
      />
      <Button write variant="primary" disabled={!key} onClick={() => unlock.mutate(undefined)}>
        {t("swarm.unlock")}
      </Button>
    </div>
  );
}

function Services() {
  const { t } = useTranslation();
  const { data = [] } = useQuery({
    queryKey: ["swarm-services"],
    queryFn: api.swarmServices,
    refetchInterval: 4000,
  });
  const [creating, setCreating] = useState(false);
  const [detail, setDetail] = useState<SwarmService | null>(null);
  const [target, setTarget] = useState<SwarmService | null>(null);
  const scale = useApiMutation(
    ({ s, replicas }: { s: SwarmService; replicas: number }) =>
      api.swarmUpdateService(s.id, { replicas }),
    [["swarm-services"]],
  );
  const remove = useApiMutation(
    (s: SwarmService) => api.swarmRemoveService(s.id),
    [["swarm-services"]],
  );
  return (
    <section>
      <PageHeader
        title={t("swarm.tab.services")}
        actions={
          <Button write variant="primary" onClick={() => setCreating(true)}>
            <Plus size={14} /> {t("swarm.newService")}
          </Button>
        }
      />
      <Table
        head={[
          t("common.name"),
          t("common.image"),
          t("swarm.replicas"),
          t("common.ports"),
          t("common.actions"),
        ]}
        empty={data.length === 0}
      >
        {data.map((s) => (
          <tr key={s.id}>
            <Td>
              <button
                type="button"
                className="font-medium hover:text-accent hover:underline"
                onClick={() => setDetail(s)}
              >
                {s.name}
              </button>
              {s.stack && <span className="ml-2 text-xs text-dim">({s.stack})</span>}
            </Td>
            <Td mono>{s.image}</Td>
            <Td>
              <span className={s.running < s.desired ? "text-amber" : ""}>
                {s.running}/{s.desired}
              </span>{" "}
              <span className="text-xs text-dim">{s.mode}</span>
            </Td>
            <Td mono>
              {s.ports.map((p) => `${p.published ?? "·"}→${p.target}/${p.protocol}`).join(", ")}
            </Td>
            <Td>
              <span className="flex items-center gap-1">
                {s.replicas !== null && (
                  <>
                    <Button
                      write
                      aria-label={`${t("swarm.scaleDown")} ${s.name}`}
                      disabled={s.replicas === 0}
                      onClick={() => scale.mutate({ s, replicas: (s.replicas ?? 1) - 1 })}
                    >
                      −
                    </Button>
                    <Button
                      write
                      aria-label={`${t("swarm.scaleUp")} ${s.name}`}
                      onClick={() => scale.mutate({ s, replicas: (s.replicas ?? 0) + 1 })}
                    >
                      +
                    </Button>
                  </>
                )}
                <Button
                  write
                  variant="danger"
                  aria-label={`${t("common.delete")} ${s.name}`}
                  onClick={() => setTarget(s)}
                >
                  <Trash2 size={14} />
                </Button>
              </span>
            </Td>
          </tr>
        ))}
      </Table>
      <NewService open={creating} onClose={() => setCreating(false)} />
      <ServiceDetail service={detail} onClose={() => setDetail(null)} />
      <ConfirmDialog
        open={target !== null}
        title={t("swarm.removeServiceTitle", { name: target?.name ?? "" })}
        confirmLabel={t("common.delete")}
        body={t("swarm.removeServiceBody")}
        onConfirm={() => target && remove.mutate(target)}
        onClose={() => setTarget(null)}
      />
    </section>
  );
}

function NewService({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [f, setF] = useState({ name: "", image: "", replicas: "1", port: "", published: "" });
  const [env, setEnv] = useState<[string, string][]>([]);
  const create = useApiMutation(
    () =>
      api.swarmCreateService({
        name: f.name,
        image: f.image.trim(),
        replicas: Number(f.replicas),
        env: Object.fromEntries(env.filter(([k]) => k.trim() !== "")),
        ports: f.port
          ? [
              {
                target: Number(f.port),
                ...(f.published ? { published: Number(f.published) } : {}),
                protocol: "tcp" as const,
              },
            ]
          : [],
      }),
    [["swarm-services"]],
    () => t("swarm.serviceCreated", { name: f.name }),
  );
  const valid =
    /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(f.name) &&
    f.image.trim() !== "" &&
    /^\d+$/.test(f.replicas);
  return (
    <Dialog open={open} onClose={onClose} title={t("swarm.newService")}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) create.mutate(undefined, { onSuccess: onClose });
        }}
      >
        <Field label={t("common.name")}>
          <Input
            value={f.name}
            onChange={(e) => setF({ ...f, name: e.target.value })}
            required
            autoFocus
          />
        </Field>
        <Field label={t("common.image")}>
          <Input
            value={f.image}
            onChange={(e) => setF({ ...f, image: e.target.value })}
            placeholder="nginx:1.27-alpine"
            required
          />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label={t("swarm.replicas")}>
            <Input
              inputMode="numeric"
              value={f.replicas}
              onChange={(e) => setF({ ...f, replicas: e.target.value.replace(/\D/g, "") })}
            />
          </Field>
          <Field label={t("topology.containerPort")}>
            <Input
              inputMode="numeric"
              value={f.port}
              onChange={(e) => setF({ ...f, port: e.target.value.replace(/\D/g, "") })}
            />
          </Field>
          <Field label={t("swarm.published")}>
            <Input
              inputMode="numeric"
              value={f.published}
              onChange={(e) => setF({ ...f, published: e.target.value.replace(/\D/g, "") })}
            />
          </Field>
        </div>
        <p className="text-xs text-amber">{t("swarm.publishedWarning")}</p>
        <EnvEditor label={t("topology.environment")} entries={env} onChange={setEnv} />
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="primary" type="submit" disabled={!valid || create.isPending}>
            {t("common.create")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function ServiceDetail({
  service,
  onClose,
}: {
  service: SwarmService | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const tasks = useQuery({
    queryKey: ["swarm-tasks", service?.id],
    queryFn: () => api.swarmTasks(service?.id ?? ""),
    enabled: !!service,
    refetchInterval: 4000,
  });
  const logs = useQuery({
    queryKey: ["swarm-logs", service?.id],
    queryFn: () => api.swarmServiceLogs(service?.id ?? ""),
    enabled: !!service,
    refetchInterval: 4000,
  });
  return (
    <Dialog open={service !== null} onClose={onClose} title={service?.name ?? ""}>
      <div className="flex flex-col gap-3">
        <Table
          head={[t("swarm.slot"), t("common.status"), t("swarm.desired"), t("swarm.error")]}
          empty={(tasks.data ?? []).length === 0}
        >
          {(tasks.data ?? []).slice(0, 12).map((k) => (
            <tr key={k.id}>
              <Td mono>{k.slot ?? "·"}</Td>
              <Td>{k.state}</Td>
              <Td>{k.desiredState}</Td>
              <Td>{k.error}</Td>
            </tr>
          ))}
        </Table>
        <pre className="max-h-64 overflow-auto rounded-lg border border-line bg-bg0 p-2 font-mono text-xs whitespace-pre-wrap">
          {logs.data?.logs || t("common.empty")}
        </pre>
      </div>
    </Dialog>
  );
}

function Nodes() {
  const { t } = useTranslation();
  const { data = [] } = useQuery({
    queryKey: ["swarm-nodes"],
    queryFn: api.swarmNodes,
    refetchInterval: 10_000,
  });
  const [target, setTarget] = useState<SwarmNode | null>(null);
  const update = useApiMutation(
    ({
      id,
      ...patch
    }: {
      id: string;
      role?: "manager" | "worker";
      availability?: "active" | "pause" | "drain";
    }) => api.swarmUpdateNode(id, patch),
    [["swarm-nodes"]],
  );
  const remove = useApiMutation(
    (n: SwarmNode) => api.swarmRemoveNode(n.id, n.state !== "down"),
    [["swarm-nodes"]],
  );
  return (
    <section>
      <Table
        head={[
          t("swarm.hostname"),
          t("swarm.role"),
          t("swarm.availability"),
          t("common.status"),
          t("swarm.address"),
          t("common.actions"),
        ]}
        empty={data.length === 0}
      >
        {data.map((n) => (
          <tr key={n.id}>
            <Td>
              {n.hostname}{" "}
              {n.leader && <span className="text-xs text-accent">({t("swarm.leader")})</span>}
            </Td>
            <Td>{t(`swarm.roles.${n.role}`)}</Td>
            <Td>
              <select
                aria-label={`${t("swarm.availability")} ${n.hostname}`}
                value={n.availability}
                onChange={(e) =>
                  update.mutate({
                    id: n.id,
                    availability: e.target.value as SwarmNode["availability"],
                  })
                }
                className="rounded-lg border border-line bg-bg0 px-2 py-1 text-sm text-fg"
              >
                {(["active", "pause", "drain"] as const).map((a) => (
                  <option key={a} value={a}>
                    {t(`swarm.availabilities.${a}`)}
                  </option>
                ))}
              </select>
            </Td>
            <Td>{n.state}</Td>
            <Td mono>{n.address}</Td>
            <Td>
              <span className="flex gap-1">
                <Button
                  write
                  onClick={() =>
                    update.mutate({ id: n.id, role: n.role === "manager" ? "worker" : "manager" })
                  }
                >
                  {n.role === "manager" ? t("swarm.demote") : t("swarm.promote")}
                </Button>
                <Button
                  write
                  variant="danger"
                  aria-label={`${t("common.delete")} ${n.hostname}`}
                  onClick={() => setTarget(n)}
                >
                  <Trash2 size={14} />
                </Button>
              </span>
            </Td>
          </tr>
        ))}
      </Table>
      <ConfirmDialog
        open={target !== null}
        title={t("swarm.removeNodeTitle", { name: target?.hostname ?? "" })}
        confirmLabel={t("common.delete")}
        body={t("swarm.removeNodeBody")}
        onConfirm={() => target && remove.mutate(target)}
        onClose={() => setTarget(null)}
      />
    </section>
  );
}

function Stacks() {
  const { t } = useTranslation();
  const { data = [] } = useQuery({
    queryKey: ["swarm-stacks"],
    queryFn: api.swarmStacks,
    refetchInterval: 8000,
  });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    yaml: "services:\n  web:\n    image: nginx:1.27-alpine\n    deploy:\n      replicas: 2\n",
  });
  const [output, setOutput] = useState("");
  const [target, setTarget] = useState<string | null>(null);
  const deploy = useApiMutation(
    () => api.swarmDeployStack(form.name, form.yaml),
    [["swarm-stacks"], ["swarm-services"]],
  );
  const remove = useApiMutation(
    (name: string) => api.swarmRemoveStack(name),
    [["swarm-stacks"], ["swarm-services"]],
  );
  return (
    <section>
      <PageHeader
        title={t("swarm.tab.stacks")}
        actions={
          <Button write variant="primary" onClick={() => setOpen(true)}>
            <Plus size={14} /> {t("swarm.deployStack")}
          </Button>
        }
      />
      <Table
        head={[t("common.name"), t("swarm.tab.services"), t("common.actions")]}
        empty={data.length === 0}
      >
        {data.map((s) => (
          <tr key={s.name}>
            <Td>{s.name}</Td>
            <Td>{s.services}</Td>
            <Td>
              <Button
                write
                variant="danger"
                aria-label={`${t("common.delete")} ${s.name}`}
                onClick={() => setTarget(s.name)}
              >
                <Trash2 size={14} />
              </Button>
            </Td>
          </tr>
        ))}
      </Table>
      {output && (
        <pre className="mt-3 max-h-48 overflow-auto rounded-lg border border-line bg-bg0 p-2 font-mono text-xs whitespace-pre-wrap">
          {output}
        </pre>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} title={t("swarm.deployStack")}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            deploy.mutate(undefined, {
              onSuccess: (r) => {
                setOutput(r.output);
                if (r.ok) setOpen(false);
              },
            });
          }}
        >
          <Field label={t("swarm.stackName")}>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              pattern="[a-z0-9][a-z0-9_\-]*"
              required
            />
          </Field>
          <Field label="Compose">
            <textarea
              className="h-56 w-full rounded-lg border border-line bg-bg0 p-2 font-mono text-xs"
              value={form.yaml}
              onChange={(e) => setForm({ ...form, yaml: e.target.value })}
              spellCheck={false}
              required
            />
          </Field>
          {output && (
            <pre className="max-h-32 overflow-auto rounded-lg border border-line bg-bg0 p-2 font-mono text-xs whitespace-pre-wrap">
              {output}
            </pre>
          )}
          <div className="flex justify-end gap-2">
            <Button onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
            <Button variant="primary" type="submit" disabled={deploy.isPending}>
              {t("common.deploy")}
            </Button>
          </div>
        </form>
      </Dialog>
      <ConfirmDialog
        open={target !== null}
        title={t("swarm.removeStackTitle", { name: target ?? "" })}
        confirmLabel={t("common.delete")}
        body={t("swarm.removeStackBody")}
        onConfirm={() => target && remove.mutate(target, { onSuccess: (r) => setOutput(r.output) })}
        onClose={() => setTarget(null)}
      />
    </section>
  );
}

function Items({ kind }: { kind: "secret" | "config" }) {
  const { t } = useTranslation();
  const key = [`swarm-${kind}s`];
  const { data = [] } = useQuery({
    queryKey: key,
    queryFn: kind === "secret" ? api.swarmSecrets : api.swarmConfigs,
  });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", value: "" });
  const [target, setTarget] = useState<SwarmItem | null>(null);
  const [shown, setShown] = useState<{ name: string; data: string } | null>(null);
  const create = useApiMutation(
    () =>
      kind === "secret"
        ? api.swarmCreateSecret(form.name, form.value)
        : api.swarmCreateConfig(form.name, form.value),
    [key],
  );
  const remove = useApiMutation(
    (i: SwarmItem) =>
      kind === "secret" ? api.swarmRemoveSecret(i.id) : api.swarmRemoveConfig(i.id),
    [key],
  );
  return (
    <section>
      <PageHeader
        title={t(`swarm.tab.${kind}s`)}
        actions={
          <Button write variant="primary" onClick={() => setOpen(true)}>
            <Plus size={14} /> {t(`swarm.new_${kind}`)}
          </Button>
        }
      />
      {kind === "secret" && <p className="mb-3 text-xs text-dim">{t("swarm.secretHint")}</p>}
      <Table
        head={[t("common.name"), t("swarm.created"), t("common.actions")]}
        empty={data.length === 0}
      >
        {data.map((i) => (
          <tr key={i.id}>
            <Td>{i.name}</Td>
            <Td mono>{new Date(i.createdAt).toLocaleString()}</Td>
            <Td>
              <span className="flex gap-1">
                {kind === "config" && (
                  <Button
                    onClick={() =>
                      void api
                        .swarmConfigData(i.id)
                        .then((r) => setShown({ name: i.name, data: r.data }))
                        .catch(
                          (e: unknown) =>
                            e instanceof ApiError && setShown({ name: i.name, data: "" }),
                        )
                    }
                  >
                    {t("swarm.view")}
                  </Button>
                )}
                <Button
                  write
                  variant="danger"
                  aria-label={`${t("common.delete")} ${i.name}`}
                  onClick={() => setTarget(i)}
                >
                  <Trash2 size={14} />
                </Button>
              </span>
            </Td>
          </tr>
        ))}
      </Table>
      <Dialog open={open} onClose={() => setOpen(false)} title={t(`swarm.new_${kind}`)}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate(undefined, {
              onSuccess: () => {
                setOpen(false);
                setForm({ name: "", value: "" });
              },
            });
          }}
        >
          <Field label={t("common.name")}>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              pattern="[a-zA-Z0-9][a-zA-Z0-9_.\-]*"
              required
              autoFocus
            />
          </Field>
          <Field label={t("swarm.value")}>
            <textarea
              className="h-32 w-full rounded-lg border border-line bg-bg0 p-2 font-mono text-xs"
              value={form.value}
              onChange={(e) => setForm({ ...form, value: e.target.value })}
              autoComplete="off"
              spellCheck={false}
              required
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
            <Button variant="primary" type="submit" disabled={create.isPending}>
              {t("common.create")}
            </Button>
          </div>
        </form>
      </Dialog>
      <Dialog open={shown !== null} onClose={() => setShown(null)} title={shown?.name ?? ""}>
        <pre className="max-h-80 overflow-auto rounded-lg border border-line bg-bg0 p-2 font-mono text-xs whitespace-pre-wrap">
          {shown?.data}
        </pre>
      </Dialog>
      <ConfirmDialog
        open={target !== null}
        title={t("swarm.removeItemTitle", { name: target?.name ?? "" })}
        confirmLabel={t("common.delete")}
        body={t("swarm.removeItemBody")}
        onConfirm={() => target && remove.mutate(target)}
        onClose={() => setTarget(null)}
      />
    </section>
  );
}

function Cluster() {
  const { t } = useTranslation();
  const status = useQuery({ queryKey: SWARM, queryFn: api.swarm });
  const [tokens, setTokens] = useState<{ worker: string; manager: string } | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [leave, setLeave] = useState(false);
  const rotate = useApiMutation(
    (target: "worker" | "manager") => api.swarmRotate(target),
    [SWARM],
    () => t("swarm.rotated"),
  );
  const autolock = useApiMutation((enabled: boolean) => api.swarmAutolock(enabled), [SWARM]);
  const leaveMutation = useApiMutation(
    () => api.swarmLeave(true),
    [SWARM],
    () => t("swarm.left"),
  );
  const s = status.data;
  return (
    <section className="flex max-w-2xl flex-col gap-4">
      {s && (
        <p className="text-sm text-dim">
          {t("swarm.summary", { nodes: s.nodes, managers: s.managers })} ·{" "}
          <span className="font-mono">{s.nodeAddr}</span>
        </p>
      )}
      <div className="flex flex-col gap-2 rounded-xl border border-line bg-bg1 p-4">
        <h2 className="font-semibold">{t("swarm.joinTokens")}</h2>
        <p className="text-xs text-amber">{t("swarm.tokensWarning")}</p>
        {tokens ? (
          <>
            {(["worker", "manager"] as const).map((r) => (
              <div key={r} className="flex items-center gap-2">
                <span className="w-20 text-xs text-dim">{t(`swarm.roles.${r}`)}</span>
                <code className="min-w-0 flex-1 break-all rounded border border-line bg-bg0 p-1 text-xs">
                  {tokens[r]}
                </code>
                <Button
                  write
                  onClick={() => rotate.mutate(r, { onSuccess: () => setTokens(null) })}
                >
                  {t("swarm.rotate")}
                </Button>
              </div>
            ))}
          </>
        ) : (
          <Button onClick={() => void api.swarmTokens().then(setTokens)}>
            {t("swarm.showTokens")}
          </Button>
        )}
      </div>
      <div className="flex flex-col gap-2 rounded-xl border border-line bg-bg1 p-4">
        <h2 className="font-semibold">{t("swarm.autolock")}</h2>
        <p className="text-xs text-dim">{t("swarm.autolockHint")}</p>
        <div className="flex flex-wrap gap-2">
          <Button write onClick={() => autolock.mutate(true)}>
            {t("swarm.enable")}
          </Button>
          <Button write onClick={() => autolock.mutate(false)}>
            {t("swarm.disable")}
          </Button>
          <Button
            onClick={() =>
              void api
                .swarmUnlockKey()
                .then((r) => setKey(r.key))
                .catch(() => setKey(""))
            }
          >
            {t("swarm.showKey")}
          </Button>
        </div>
        {key !== null && (
          <code className="break-all rounded border border-line bg-bg0 p-1 text-xs">
            {key || t("swarm.noKey")}
          </code>
        )}
      </div>
      <div className="flex flex-col gap-2 rounded-xl border border-line p-4">
        <h2 className="font-semibold text-danger">{t("swarm.leaveTitle")}</h2>
        <p className="text-xs text-dim">{t("swarm.leaveHint")}</p>
        <Button write variant="danger" className="w-fit" onClick={() => setLeave(true)}>
          {t("swarm.leave")}
        </Button>
      </div>
      <LeaveSwarmDialog
        open={leave}
        onConfirm={() => leaveMutation.mutate(undefined)}
        onClose={() => setLeave(false)}
      />
    </section>
  );
}
