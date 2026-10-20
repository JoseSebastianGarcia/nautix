import { type Container, GATEWAY_INFO, GatewayRoute } from "@nautix/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../app/api.js";
import { useContainers } from "../../app/queries.js";
import { useApiMutation } from "../../app/use-api-mutation.js";
import { Button, Input, ShowCommand } from "../../components/ui.js";
import { PageHeader } from "../resources/table.js";
import { LogoBadge } from "../topology/logo-badge.js";
import {
  blankRoute,
  candidatesFor,
  type DraftRoute,
  fromDraft,
  gateways,
  kindOf,
  toDraft,
  trafficPort,
  upstreamFor,
} from "./gateway-utils.js";

const NO_CONTAINERS: Container[] = [];

export function GatewayPage() {
  const { t } = useTranslation();
  const { data: containers = NO_CONTAINERS } = useContainers();
  const list = useMemo(() => gateways(containers), [containers]);
  const [selected, setSelected] = useState<string | null>(null);
  const gateway = list.find((g) => g.name === selected) ?? list[0];

  return (
    <div className="flex flex-col gap-4 p-6">
      <PageHeader title={t("gateway.title")} />
      {list.length === 0 ? (
        <p className="max-w-2xl text-sm text-dim">{t("gateway.none")}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {list.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setSelected(g.name)}
                aria-pressed={gateway?.name === g.name}
                className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${gateway?.name === g.name ? "border-accent bg-accent-soft text-accent" : "border-line text-dim hover:text-fg"}`}
              >
                <LogoBadge image={g.image} name={g.name} size={20} /> {g.name}
                <span className="rounded bg-bg2 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-dim">
                  {t(`gateway.category.${GATEWAY_INFO[kindOf(g) ?? "kong"].category}`)}
                </span>
              </button>
            ))}
          </div>
          {gateway && <Editor key={gateway.name} gateway={gateway} containers={containers} />}
        </>
      )}
    </div>
  );
}

function Editor({ gateway, containers }: { gateway: Container; containers: Container[] }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const saved = useQuery({
    queryKey: ["gateway-routes", gateway.name],
    queryFn: () => api.gatewayRoutes(gateway.name),
  });
  const [rows, setRows] = useState<DraftRoute[] | null>(null);
  const [output, setOutput] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (saved.data && rows === null) setRows(saved.data.map(toDraft));
  }, [saved.data, rows]);

  const current = rows ?? [];
  const candidates = useMemo(() => candidatesFor(gateway, containers), [gateway, containers]);
  const kind = kindOf(gateway);
  const info = kind ? GATEWAY_INFO[kind] : null;
  const proxyPort = trafficPort(gateway);
  const running = gateway.state === "running";

  const results = current.map((r) => GatewayRoute.safeParse(fromDraft(r)));
  const names = current.map((r) => r.name.trim());
  const duplicate = (i: number) => names.indexOf(names[i] ?? "") !== i;
  const allValid = results.every((r) => r.success) && !current.some((_, i) => duplicate(i));
  const update = (i: number, patch: Partial<DraftRoute>) =>
    setRows(current.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const apply = useApiMutation(
    async (saveFirst: boolean) => {
      if (saveFirst) {
        await api.saveGatewayRoutes(
          gateway.name,
          results.flatMap((r) => (r.success ? [r.data] : [])),
        );
        await qc.invalidateQueries({ queryKey: ["gateway-routes", gateway.name] });
      }
      return api.applyGateway(gateway.name);
    },
    [],
    undefined,
    () => t("gateway.applying", { name: gateway.name }),
  );
  const run = (saveFirst: boolean) =>
    apply.mutate(saveFirst, {
      onSuccess: (r) => setOutput({ ok: r.ok, text: r.output }),
    });

  const cell = "rounded-lg border border-line bg-bg0 px-2 py-1.5 text-sm text-fg";
  return (
    <div className="flex flex-col gap-4">
      {!running && <p className="text-sm text-amber">{t("gateway.notRunning")}</p>}
      <p className="max-w-3xl text-sm text-dim">
        {info && <strong className="text-fg">{info.label} · </strong>}
        {t("gateway.intro")}
      </p>
      {info && !info.upstreamPath && (
        <p className="max-w-3xl text-xs text-dim">
          {t("gateway.noUpstreamPath", { name: info.label })}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-line bg-bg1">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-wider text-dim">
            <tr>
              <th className="px-3 py-2 font-medium">{t("common.name")}</th>
              <th className="px-3 py-2 font-medium">{t("gateway.path")}</th>
              <th className="px-3 py-2 font-medium">{t("gateway.host")}</th>
              <th className="px-3 py-2 font-medium">{t("gateway.destination")}</th>
              <th className="px-3 py-2 font-medium">{t("gateway.strip")}</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {current.map((r, i) => {
              const problem = results[i]?.success
                ? duplicate(i)
                  ? t("gateway.duplicate")
                  : null
                : (results[i] as { error: { issues: { message: string }[] } }).error.issues[0]
                    ?.message;
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional drafts
                <tr key={i} className="align-top">
                  <td className="px-3 py-2">
                    <Input
                      aria-label={`${t("common.name")} ${i + 1}`}
                      value={r.name}
                      onChange={(e) => update(i, { name: e.target.value })}
                      className="w-36"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      aria-label={`${t("gateway.path")} ${i + 1}`}
                      value={r.path}
                      onChange={(e) => update(i, { path: e.target.value })}
                      placeholder="/hola"
                      className="w-36"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      aria-label={`${t("gateway.host")} ${i + 1}`}
                      value={r.host}
                      onChange={(e) => update(i, { host: e.target.value })}
                      placeholder="api.mi.lan"
                      className="w-40"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-1">
                      <select
                        aria-label={`${t("gateway.pick")} ${i + 1}`}
                        value=""
                        onChange={(e) => {
                          const c = candidates[Number(e.target.value)];
                          if (c) update(i, { upstream: upstreamFor(c) });
                        }}
                        className={cell}
                      >
                        <option value="">{t("gateway.pick")}</option>
                        {candidates.map((c, n) => (
                          <option key={c.label} value={n}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                      <Input
                        aria-label={`${t("gateway.destination")} ${i + 1}`}
                        value={r.upstream}
                        onChange={(e) => update(i, { upstream: e.target.value })}
                        placeholder="http://servicio:8080"
                        className="w-72"
                      />
                      {problem && <span className="text-xs text-danger">{problem}</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label={`${t("gateway.strip")} ${i + 1}`}
                      checked={r.stripPath}
                      onChange={(e) => update(i, { stripPath: e.target.checked })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Button
                      write
                      aria-label={`${t("common.delete")} ${r.name}`}
                      onClick={() => setRows(current.filter((_, j) => j !== i))}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {current.length === 0 && (
          <p className="p-6 text-center text-sm text-dim">{t("gateway.noRoutes")}</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button write onClick={() => setRows([...current, blankRoute(current)])}>
          <Plus size={14} /> {t("gateway.addRoute")}
        </Button>
        <Button
          write
          variant="primary"
          disabled={!allValid || !running || apply.isPending || rows === null}
          onClick={() => run(true)}
        >
          <Save size={14} /> {t("gateway.saveApply")}
        </Button>
        <Button
          write
          disabled={!running || apply.isPending || (saved.data?.length ?? 0) === 0}
          onClick={() => run(false)}
        >
          <RefreshCw size={14} /> {t("gateway.reapply")}
        </Button>
      </div>
      <p className="text-xs text-dim">{t("gateway.restartNote")}</p>

      {output && (
        <section className="rounded-xl border border-line bg-bg1 p-3" aria-live="polite">
          <p className={`mb-1 text-sm ${output.ok ? "text-ok" : "text-danger"}`}>
            {output.ok ? t("gateway.applied") : t("gateway.failed")}
          </p>
          {output.text && (
            <pre className="max-h-48 overflow-auto font-mono text-xs whitespace-pre-wrap">
              {output.text}
            </pre>
          )}
          {!output.ok && <p className="mt-2 text-xs text-dim">{t("gateway.failedHint")}</p>}
        </section>
      )}

      {proxyPort ? (
        <ShowCommand
          command={
            current
              .filter((r) => r.path.trim())
              .map(
                (r) =>
                  `curl -i http://127.0.0.1:${proxyPort}${r.path.trim()}${r.host.trim() ? ` -H 'Host: ${r.host.trim()}'` : ""}`,
              )
              .join("\n") || `curl -i http://127.0.0.1:${proxyPort}/`
          }
        />
      ) : (
        <p className="text-xs text-dim">{t("gateway.noProxyPort")}</p>
      )}
    </div>
  );
}
