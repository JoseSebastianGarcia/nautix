import {
  type Container,
  cidrContains,
  GUARD_BACKENDS,
  type GuardBackend,
  type GuardRule,
  isCidr,
} from "@nautix/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, api } from "../../app/api.js";
import { useContainers } from "../../app/queries.js";
import { useApiMutation } from "../../app/use-api-mutation.js";
import { useToasts } from "../../components/toast-store.js";
import { Button, ConfirmDialog, Field, Input, ShowCommand } from "../../components/ui.js";
import { PageHeader, Table, Td } from "../resources/table.js";

const STATUS = ["guard-status"];
const NO_RULES: GuardRule[] = [];
const NO_CONTAINERS: Container[] = [];

const ruleId = (r: Pick<GuardRule, "container" | "port" | "protocol">): string =>
  `${r.container}/${r.port}/${r.protocol}`;
const sources = (text: string): string[] => text.split(/[\s,]+/).filter(Boolean);

/** Seconds left until an ISO deadline (never negative). */
const secondsUntil = (iso: string, now: number): number =>
  Math.max(0, Math.ceil((Date.parse(iso) - now) / 1000));

export function GuardPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const push = useToasts((s) => s.push);
  const { data: containers = NO_CONTAINERS } = useContainers();
  const status = useQuery({ queryKey: STATUS, queryFn: api.guardStatus, refetchInterval: 4000 });
  const me = useQuery({
    queryKey: ["client-address"],
    queryFn: api.clientAddress,
    staleTime: 60_000,
  });
  const myAddress = me.data?.address ?? "";

  const state = status.data;
  const [draft, setDraft] = useState<GuardRule[]>(NO_RULES);
  const [dirty, setDirty] = useState(false);
  const [form, setForm] = useState({ target: "", allow: "" });
  const [ack, setAck] = useState<"lockout" | null>(null);
  const [disable, setDisable] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // The table shows what is on trial if something is, else what is confirmed; edits stay a draft.
  const stored = state?.trial?.rules ?? state?.rules ?? NO_RULES;
  useEffect(() => {
    if (!dirty) setDraft(stored);
  }, [stored, dirty]);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const published = containers.flatMap((c) =>
    c.ports
      .filter((p) => p.publicPort !== undefined)
      .map((p) => ({
        container: c.name,
        port: p.privatePort,
        protocol: p.type,
        host: p.publicPort,
      })),
  );
  const options = published.filter((p) => p.protocol === "tcp" || p.protocol === "udp");
  const picked = options.find((o) => `${o.container}|${o.port}|${o.protocol}` === form.target);
  const list = sources(form.allow);
  const formOk =
    picked !== undefined &&
    list.length > 0 &&
    list.every(isCidr) &&
    !draft.some((r) => ruleId(r) === `${picked.container}/${picked.port}/${picked.protocol}`);

  const add = () => {
    if (!picked || !formOk) return;
    setDraft([
      ...draft,
      {
        container: picked.container,
        port: picked.port,
        protocol: picked.protocol as "tcp" | "udp",
        allow: list,
      },
    ]);
    setDirty(true);
    setForm({ target: "", allow: "" });
  };

  const save = async (acknowledge: boolean) => {
    try {
      const res = await api.saveGuardRules(draft, acknowledge);
      setDirty(false);
      setAck(null);
      push("ok", res.trialUntil ? t("guard.onTrial") : t("guard.saved"));
    } catch (error) {
      if (
        error instanceof ApiError &&
        (error.hintKey === "errors.guardLockout" || error.hintKey === "errors.guardLockoutSelf")
      ) {
        setAck("lockout");
        return;
      }
      push(
        "error",
        t(error instanceof ApiError && error.hintKey ? error.hintKey : "errors.generic"),
      );
    } finally {
      void qc.invalidateQueries({ queryKey: STATUS });
    }
  };

  const confirm = useApiMutation(
    () => api.confirmGuard(),
    [STATUS],
    () => t("guard.kept"),
  );
  const off = useApiMutation(
    () => api.disableGuard(),
    [STATUS],
    () => t("guard.disabled"),
  );

  const trial = state?.trial ?? null;
  const left = trial ? secondsUntil(trial.deadline, now) : 0;
  const helper = state?.helper;

  return (
    <div className="flex flex-col gap-4 p-6">
      <PageHeader title={t("guard.title")} />
      <p className="max-w-3xl text-xs text-dim">{t("guard.intro")}</p>

      <HelperCard connected={helper?.connected ?? false} />

      {trial && (
        <section
          role="status"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-amber bg-bg1 p-4"
        >
          <ShieldCheck size={18} className="text-amber" />
          <p className="flex-1 text-sm">{t("guard.trial", { seconds: left })}</p>
          <Button write variant="primary" onClick={() => confirm.mutate(undefined)}>
            {t("guard.keep")}
          </Button>
        </section>
      )}
      {helper?.ok === false && helper.error && (
        <p className="text-sm text-danger">{t("guard.helperError", { error: helper.error })}</p>
      )}

      <form
        className="grid items-end gap-3 sm:grid-cols-[1fr_1.5fr_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <Field label={t("guard.port")}>
          <select
            aria-label={t("guard.port")}
            value={form.target}
            onChange={(e) => setForm({ ...form, target: e.target.value })}
            className="rounded-lg border border-line bg-bg0 px-2 py-2 text-sm text-fg"
          >
            <option value="">{t("guard.pickPort")}</option>
            {options.map((o) => (
              <option
                key={`${o.container}|${o.port}|${o.protocol}`}
                value={`${o.container}|${o.port}|${o.protocol}`}
              >
                {o.container} · {o.port}/{o.protocol} → {o.host}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("guard.allow")} hint={t("guard.allowHint")}>
          <Input
            value={form.allow}
            onChange={(e) => setForm({ ...form, allow: e.target.value })}
            placeholder="10.0.0.0/24, 192.168.1.5"
            aria-invalid={form.allow !== "" && !list.every(isCidr)}
          />
          {myAddress !== "" && (
            <button
              type="button"
              className="mt-1 w-fit text-xs text-accent hover:underline"
              onClick={() => setForm({ ...form, allow: [...list, myAddress].join(", ") })}
            >
              {t("gateway.addMine", { address: myAddress })}
            </button>
          )}
        </Field>
        <Button write variant="primary" type="submit" disabled={!formOk}>
          <Plus size={14} /> {t("dns.add")}
        </Button>
      </form>

      <Table
        head={[t("guard.rule"), t("guard.allow"), t("common.actions")]}
        empty={draft.length === 0}
      >
        {draft.map((r) => {
          const unresolved = state?.unresolved.some((u) => ruleId(u) === ruleId(r));
          const excluded = myAddress !== "" && !r.allow.some((c) => cidrContains(c, myAddress));
          return (
            <tr key={ruleId(r)}>
              <Td mono>
                {r.container} · {r.port}/{r.protocol}
                {unresolved && (
                  <span className="ml-2 text-xs text-amber">{t("guard.unresolved")}</span>
                )}
              </Td>
              <Td mono>
                {r.allow.join(", ")}
                {excluded && (
                  <span className="ml-2 text-xs text-amber">
                    {t("gateway.lockout", { address: myAddress })}
                  </span>
                )}
              </Td>
              <Td>
                <Button
                  write
                  variant="danger"
                  aria-label={`${t("common.delete")} ${ruleId(r)}`}
                  onClick={() => {
                    setDraft(draft.filter((x) => ruleId(x) !== ruleId(r)));
                    setDirty(true);
                  }}
                >
                  <Trash2 size={14} />
                </Button>
              </Td>
            </tr>
          );
        })}
      </Table>

      <div className="flex flex-wrap items-center gap-3">
        <Button write variant="primary" disabled={!dirty} onClick={() => void save(false)}>
          {t("guard.apply")}
        </Button>
        <Button
          write
          variant="danger"
          disabled={(state?.rules.length ?? 0) === 0 && !trial}
          onClick={() => setDisable(true)}
        >
          {t("guard.disable")}
        </Button>
        {dirty && <span className="text-xs text-amber">{t("dns.unsaved")}</span>}
      </div>
      <p className="text-xs text-dim">{t("guard.note")}</p>

      <Preview />

      <ConfirmDialog
        open={ack !== null}
        title={t("guard.lockoutTitle")}
        body={t("guard.lockoutBody")}
        onConfirm={() => void save(true)}
        onClose={() => setAck(null)}
      />
      <ConfirmDialog
        open={disable}
        title={t("guard.disable")}
        body={t("guard.disableBody")}
        onConfirm={() => off.mutate(undefined)}
        onClose={() => setDisable(false)}
      />
    </div>
  );
}

/** The helper is a separate privileged container: this card creates its token and shows how to run it. */
function HelperCard({ connected }: { connected: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const push = useToasts((s) => s.push);
  const { data: containers = NO_CONTAINERS } = useContainers();
  const [token, setToken] = useState<string | null>(null);
  const create = useApiMutation(() => api.createGuardToken(), [STATUS]);
  const image = containers.find((c) => c.isSelf)?.image ?? "<nautix-image>";
  const https = window.location.protocol === "https:";
  const port = window.location.port || (https ? "443" : "80");
  const command = [
    "docker run -d --name nautix-guard --restart unless-stopped \\",
    "  --network host --cap-add NET_ADMIN --user 0 \\",
    `  -e NAUTIX_URL=${https ? "https" : "http"}://127.0.0.1:${port} \\`,
    ...(https ? ["  -e NAUTIX_GUARD_INSECURE=1 \\"] : []),
    `  -e NAUTIX_GUARD_TOKEN=${token ?? "<token>"} \\`,
    `  ${image} node dist/guard-helper.js`,
  ].join("\n");

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-line bg-bg1 p-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold">{t("guard.helper")}</h2>
        <span
          className={`rounded px-2 py-0.5 text-xs ${connected ? "bg-accent-soft text-accent" : "bg-bg2 text-dim"}`}
        >
          {connected ? t("guard.connected") : t("guard.notConnected")}
        </span>
      </div>
      <p className="text-xs text-dim">{t("guard.helperBody")}</p>
      {!connected && (
        <>
          {token === null ? (
            <Button
              write
              className="w-fit"
              onClick={() =>
                create.mutate(undefined, {
                  onSuccess: (r) => {
                    setToken(r.token);
                    void qc.invalidateQueries({ queryKey: STATUS });
                  },
                })
              }
            >
              {t("guard.createToken")}
            </Button>
          ) : (
            <p className="text-xs text-amber">{t("guard.tokenOnce")}</p>
          )}
          {token !== null ? (
            <div className="flex flex-col gap-2">
              <pre className="overflow-auto rounded-lg border border-line bg-bg0 p-3 font-mono text-xs whitespace-pre-wrap">
                {command}
              </pre>
              <Button
                className="w-fit"
                onClick={() => {
                  void navigator.clipboard?.writeText(command);
                  push("ok", t("common.copied"));
                }}
              >
                {t("common.copy")}
              </Button>
            </div>
          ) : (
            <ShowCommand command={command} />
          )}
          <p className="text-xs text-dim">{t("guard.helperNote")}</p>
        </>
      )}
    </section>
  );
}

/** The exact firewall commands for the rules in force, shown before anything is enforced. */
function Preview() {
  const { t } = useTranslation();
  const [backend, setBackend] = useState<GuardBackend>("iptables");
  const [open, setOpen] = useState(false);
  const plan = useQuery({
    queryKey: ["guard-preview", backend],
    queryFn: () => api.guardPreview(backend),
    enabled: open,
  });
  return (
    <details onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)} className="text-sm">
      <summary className="cursor-pointer text-dim hover:text-fg">{t("guard.preview")}</summary>
      <div className="mt-2 flex flex-col gap-2">
        <select
          aria-label={t("guard.backend")}
          value={backend}
          onChange={(e) => setBackend(e.target.value as GuardBackend)}
          className="w-fit rounded-lg border border-line bg-bg0 px-2 py-1 text-fg"
        >
          {GUARD_BACKENDS.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
        <pre className="max-h-64 overflow-auto rounded-lg border border-line bg-bg0 p-2 font-mono text-xs whitespace-pre-wrap">
          {plan.data?.apply
            .map(
              (s) =>
                `${s.argv.join(" ")}${s.stdin ? `\n${s.stdin}` : ""}${s.file ? `\n${s.file.content}` : ""}`,
            )
            .join("\n\n") || t("common.empty")}
        </pre>
      </div>
    </details>
  );
}
