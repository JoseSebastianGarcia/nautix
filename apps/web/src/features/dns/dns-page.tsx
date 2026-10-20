import {
  DNS_INFO,
  type DnsEntry,
  type DnsServer,
  HOSTNAME,
  ipFamily,
  isIpAddress,
  ResourceName,
} from "@nautix/contracts";
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
const NO_RECORDS: DnsEntry[] = [];

const same = (a: DnsEntry[], b: DnsEntry[]): boolean => JSON.stringify(a) === JSON.stringify(b);

/** What the record points at: an IP address, or a container whose current IP is looked up on apply. */
const target = (e: DnsEntry): string => ("ip" in e ? e.ip : e.container);

/** Normalises what the user typed the same way the API does; null when it is neither an IP nor a container name. */
const clean = (r: { name: string; to: string }): DnsEntry | null => {
  const name = r.name.trim().toLowerCase();
  const to = r.to.trim();
  if (isIpAddress(to)) return { name, ip: to };
  return ResourceName.safeParse(to).success ? { name, container: to } : null;
};

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
  const [draft, setDraft] = useState<DnsEntry[]>(NO_RECORDS);
  const [form, setForm] = useState({ name: "", to: "" });
  const [editing, setEditing] = useState<number | null>(null);
  const { data: containers = [] } = useContainers();
  const currentIp = (name: string): string | undefined => {
    const ips = Object.values(containers.find((c) => c.name === name)?.ips ?? {});
    return ips.find((ip) => !ip.includes(":"));
  };
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
  const nameOk = HOSTNAME.test(form.name.trim().toLowerCase()) && form.name.trim().length <= 253;
  const family = (e: DnsEntry): number => ("ip" in e ? ipFamily(e.ip) : 4);
  const clash =
    row !== null &&
    draft.some((r, i) => i !== editing && r.name === row.name && family(r) === family(row));
  const canAdd = nameOk && row !== null && !clash;
  const dirty = !same(draft, saved.data ?? NO_RECORDS);
  const running = server.state === "running";
  const info = server.kind ? DNS_INFO[server.kind] : null;
  const canApply = running || info?.writesWhileStopped === true;

  const submit = () => {
    if (!canAdd) return;
    if (!row) return;
    setDraft(editing === null ? [...draft, row] : draft.map((r, i) => (i === editing ? row : r)));
    setForm({ name: "", to: "" });
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
        {info && (
          <p className="mt-2 text-xs text-dim">
            <span className="font-medium text-fg">{info.label}</span> ·{" "}
            {t(`dns.manageApply.${info.applies}`)} {info.subdomains && t("dns.subdomainsNote")}
          </p>
        )}
        {!running &&
          (info?.writesWhileStopped ? (
            <p className="mt-2 text-xs text-amber">{t("dns.firstApply")}</p>
          ) : (
            <p className="mt-2 text-xs text-amber">{t("dns.notRunning")}</p>
          ))}
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
        <Field label={t("dns.target")} hint={t("dns.targetHint")}>
          <Input
            list="dns-targets"
            value={form.to}
            onChange={(e) => setForm({ ...form, to: e.target.value })}
            placeholder="my-app  |  192.168.1.20"
            aria-invalid={form.to !== "" && row === null}
          />
          <datalist id="dns-targets">
            {containers.map((c) => (
              <option key={c.id} value={c.name}>
                {currentIp(c.name) ?? ""}
              </option>
            ))}
          </datalist>
        </Field>
        <Button write variant="primary" type="submit" disabled={!canAdd}>
          <Plus size={14} /> {editing === null ? t("dns.add") : t("common.save")}
        </Button>
      </form>
      {clash && <p className="-mt-2 text-xs text-danger">{t("dns.clash")}</p>}

      <Table
        head={[t("dns.domain"), t("dns.target"), t("common.actions")]}
        empty={draft.length === 0}
      >
        {draft.map((r, i) => (
          <tr key={`${r.name}/${target(r)}`}>
            <Td mono>{r.name}</Td>
            <Td mono>
              {target(r)}
              {"container" in r && (
                <span className="ml-2 text-xs text-dim">
                  {t("dns.container")} · {currentIp(r.container) ?? t("dns.noIp")}
                </span>
              )}
            </Td>
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
                  onClick={() => {
                    setForm({ name: r.name, to: target(r) });
                    setEditing(i);
                  }}
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
          disabled={!canApply || apply.isPending || (!dirty && !saved.data)}
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
      </div>
      {output && (
        <pre className="max-h-48 overflow-auto rounded-lg border border-line bg-bg0 p-2 font-mono text-xs whitespace-pre-wrap">
          {output}
        </pre>
      )}
    </section>
  );
}
