import { type DnsRecord, type DnsServer, HOSTNAME, ipFamily, isIpAddress } from "@nautix/contracts";
import { useQuery } from "@tanstack/react-query";
import { Pencil, Plus, Radar, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { api } from "../../app/api.js";
import { useContainers } from "../../app/queries.js";
import { useApiMutation } from "../../app/use-api-mutation.js";
import { useToasts } from "../../components/toast-store.js";
import { Button, Field, Input } from "../../components/ui.js";
import { PageHeader, Table, Td } from "../resources/table.js";

const SERVERS = ["dns-servers"];
const NO_SERVERS: DnsServer[] = [];
const NO_RECORDS: DnsRecord[] = [];

const same = (a: DnsRecord[], b: DnsRecord[]): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Normalises what the user typed the same way the API does. */
const clean = (r: { name: string; ip: string }): DnsRecord => ({
  name: r.name.trim().toLowerCase(),
  ip: r.ip.trim(),
});

export function DnsPage() {
  const { t } = useTranslation();
  const { data: servers = NO_SERVERS } = useQuery({
    queryKey: SERVERS,
    queryFn: api.dnsServers,
    refetchInterval: 15_000,
  });
  const editable = servers.filter((s) => s.kind !== null);
  const others = servers.filter((s) => s.kind === null);
  const [selected, setSelected] = useState<string | null>(null);
  const server = editable.find((s) => s.name === selected) ?? editable[0];

  return (
    <div className="flex flex-col gap-4 p-6">
      <PageHeader title={t("dns.title")} />
      <p className="text-xs text-dim">{t("dns.intro")}</p>
      {!server ? (
        <Requirement others={others} />
      ) : (
        <>
          {editable.length > 1 && (
            <select
              aria-label={t("dns.server")}
              value={server.name}
              onChange={(e) => setSelected(e.target.value)}
              className="w-fit rounded-lg border border-line bg-bg0 px-2 py-2 text-sm text-fg"
            >
              {editable.map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
          <Editor key={server.name} server={server} />
        </>
      )}
    </div>
  );
}

function Requirement({ others }: { others: DnsServer[] }) {
  const { t } = useTranslation();
  return (
    <section className="flex max-w-2xl flex-col gap-3 rounded-xl border border-line bg-bg1 p-5">
      <h2 className="font-semibold">{t("dns.needServer")}</h2>
      <p className="text-sm text-dim">{t("dns.needServerBody")}</p>
      <Link to="/" className="w-fit">
        <Button variant="primary">{t("dns.goDeploy")}</Button>
      </Link>
      {others.length > 0 && (
        <div className="border-t border-line pt-3 text-sm">
          <p className="text-dim">{t("dns.unsupported")}</p>
          <ul className="mt-1 list-disc pl-5 font-mono text-xs">
            {others.map((s) => (
              <li key={s.id}>
                {s.name} <span className="text-dim">({s.image})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Editor({ server }: { server: DnsServer }) {
  const { t } = useTranslation();
  const push = useToasts((s) => s.push);
  const saved = useQuery({
    queryKey: ["dns-records", server.name],
    queryFn: () => api.dnsRecords(server.name),
  });
  const [draft, setDraft] = useState<DnsRecord[]>(NO_RECORDS);
  const [form, setForm] = useState({ name: "", ip: "" });
  const [editing, setEditing] = useState<number | null>(null);
  const { data: containers = [] } = useContainers();
  const addresses = containers.flatMap((c) =>
    Object.entries(c.ips ?? {}).map(([network, ip]) => ({
      key: `${c.id}/${network}`,
      label: `${c.name} · ${network} · ${ip}`,
      ip,
    })),
  );
  const [output, setOutput] = useState("");

  useEffect(() => {
    if (saved.data) setDraft(saved.data);
  }, [saved.data]);

  const apply = useApiMutation(async () => {
    await api.saveDnsRecords(server.name, draft);
    return api.applyDns(server.name);
  }, [["dns-records", server.name]]);
  const test = useApiMutation((host: string) => api.dnsLookup(server.name, host), []);

  const row = clean(form);
  const nameOk = HOSTNAME.test(row.name) && row.name.length <= 253;
  const ipOk = isIpAddress(row.ip);
  const clash = draft.some(
    (r, i) =>
      i !== editing && r.name === row.name && ipFamily(r.ip) === (ipOk ? ipFamily(row.ip) : -1),
  );
  const canAdd = nameOk && ipOk && !clash;
  const dirty = !same(draft, saved.data ?? NO_RECORDS);
  const running = server.state === "running";

  const submit = () => {
    if (!canAdd) return;
    setDraft(editing === null ? [...draft, row] : draft.map((r, i) => (i === editing ? row : r)));
    setForm({ name: "", ip: "" });
    setEditing(null);
  };

  return (
    <section className="flex flex-col gap-4">
      <div className="rounded-xl border border-line bg-bg1 p-4 text-sm">
        <p className="font-medium">{t("dns.useIt")}</p>
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-xs text-dim">
          {Object.entries(server.ips).map(([net, ip]) => (
            <li key={net}>
              {t("dns.useInNetwork", { network: net })}: <code className="text-fg">--dns {ip}</code>
            </li>
          ))}
          <li>
            {t("dns.useFromHost")}: <code className="text-fg">dig @127.0.0.1 -p 5353 name</code>
          </li>
        </ul>
        {!running && <p className="mt-2 text-xs text-amber">{t("dns.notRunning")}</p>}
      </div>

      <form
        className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label={t("dns.domain")} hint={t("dns.domainHint")}>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="app.home.lab"
            aria-invalid={form.name !== "" && !nameOk}
          />
        </Field>
        <Field label={t("dns.ip")}>
          <Input
            value={form.ip}
            onChange={(e) => setForm({ ...form, ip: e.target.value })}
            placeholder="192.168.1.20"
            aria-invalid={form.ip !== "" && !ipOk}
          />
          {addresses.length > 0 && (
            <select
              aria-label={t("dns.pickContainer")}
              value=""
              onChange={(e) => setForm({ ...form, ip: e.target.value })}
              className="mt-1 rounded-lg border border-line bg-bg0 px-2 py-1 text-xs text-fg"
            >
              <option value="">{t("dns.pickContainer")}…</option>
              {addresses.map((a) => (
                <option key={a.key} value={a.ip}>
                  {a.label}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Button write variant="primary" type="submit" disabled={!canAdd}>
          <Plus size={14} /> {editing === null ? t("dns.add") : t("common.save")}
        </Button>
      </form>
      {clash && <p className="-mt-2 text-xs text-danger">{t("dns.clash")}</p>}

      <Table head={[t("dns.domain"), t("dns.ip"), t("common.actions")]} empty={draft.length === 0}>
        {draft.map((r, i) => (
          <tr key={`${r.name}/${r.ip}`}>
            <Td mono>{r.name}</Td>
            <Td mono>{r.ip}</Td>
            <Td>
              <span className="flex gap-1">
                <Button
                  aria-label={`${t("dns.test")} ${r.name}`}
                  title={t("dns.test")}
                  disabled={!running || dirty}
                  onClick={() => test.mutate(r.name, { onSuccess: (res) => setOutput(res.output) })}
                >
                  <Radar size={14} />
                </Button>
                <Button
                  write
                  aria-label={`${t("topology.editTemplate")} ${r.name}`}
                  onClick={() => (setForm(r), setEditing(i))}
                >
                  <Pencil size={14} />
                </Button>
                <Button
                  write
                  variant="danger"
                  aria-label={`${t("common.delete")} ${r.name}`}
                  onClick={() => setDraft(draft.filter((_, j) => j !== i))}
                >
                  <Trash2 size={14} />
                </Button>
              </span>
            </Td>
          </tr>
        ))}
      </Table>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          write
          variant="primary"
          disabled={!running || apply.isPending || (!dirty && !saved.data)}
          onClick={() =>
            apply.mutate(undefined, {
              onSuccess: (res) => {
                setOutput(res.output);
                push(res.ok ? "ok" : "error", res.ok ? t("dns.applied") : t("dns.rejected"));
              },
            })
          }
        >
          {t("dns.apply")}
        </Button>
        {dirty && <span className="text-xs text-amber">{t("dns.unsaved")}</span>}
        <span className="text-xs text-dim">{t("dns.applyHint")}</span>
      </div>
      {output && (
        <pre className="max-h-48 overflow-auto rounded-lg border border-line bg-bg0 p-2 font-mono text-xs whitespace-pre-wrap">
          {output}
        </pre>
      )}
    </section>
  );
}
