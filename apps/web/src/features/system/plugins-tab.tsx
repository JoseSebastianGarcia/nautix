import type { PluginInfo, PluginPrivilege } from "@nautix/contracts";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../app/api.js";
import { useApiMutation } from "../../app/use-api-mutation.js";
import { Button, ConfirmDialog, Dialog, Field, Input } from "../../components/ui.js";
import { PageHeader, Table, Td } from "../resources/table.js";

const KEY = ["plugins"];

/** docker plugin: list, install (after the user reviews what it asks for), enable/disable, remove. */
export function PluginsTab() {
  const { t } = useTranslation();
  const { data = [] } = useQuery({ queryKey: KEY, queryFn: api.plugins });
  const [adding, setAdding] = useState(false);
  const [remote, setRemote] = useState("");
  const [asks, setAsks] = useState<PluginPrivilege[] | null>(null);
  const [target, setTarget] = useState<PluginInfo | null>(null);
  const review = useApiMutation((r: string) => api.pluginPrivileges(r), []);
  const install = useApiMutation(
    () => api.installPlugin(remote, asks ?? []),
    [KEY],
    () => t("plugins.installed", { name: remote }),
    () => t("plugins.installing", { name: remote }),
  );
  const toggle = useApiMutation(
    (p: PluginInfo) => (p.enabled ? api.disablePlugin(p.name) : api.enablePlugin(p.name)),
    [KEY],
  );
  const remove = useApiMutation((p: PluginInfo) => api.removePlugin(p.name, p.enabled), [KEY]);
  const close = () => {
    setAdding(false);
    setAsks(null);
    setRemote("");
  };

  return (
    <section>
      <PageHeader
        title={t("system.tab.plugins")}
        actions={
          <Button write variant="primary" onClick={() => setAdding(true)}>
            <Plus size={14} /> {t("plugins.install")}
          </Button>
        }
      />
      <p className="mb-3 text-xs text-dim">{t("plugins.hint")}</p>
      <Table
        head={[t("common.name"), t("common.status"), t("plugins.description"), t("common.actions")]}
        empty={data.length === 0}
      >
        {data.map((p) => (
          <tr key={p.id}>
            <Td mono>{p.name}</Td>
            <Td>{p.enabled ? t("plugins.enabled") : t("plugins.disabled")}</Td>
            <Td>{p.description}</Td>
            <Td>
              <span className="flex gap-1">
                <Button write onClick={() => toggle.mutate(p)}>
                  {p.enabled ? t("plugins.disable") : t("plugins.enable")}
                </Button>
                <Button
                  write
                  variant="danger"
                  aria-label={`${t("common.delete")} ${p.name}`}
                  onClick={() => setTarget(p)}
                >
                  <Trash2 size={14} />
                </Button>
              </span>
            </Td>
          </tr>
        ))}
      </Table>
      <Dialog open={adding} onClose={close} title={t("plugins.install")}>
        <div className="flex flex-col gap-4">
          <Field label={t("plugins.remote")} hint={t("plugins.remoteHint")}>
            <Input
              value={remote}
              onChange={(e) => {
                setRemote(e.target.value);
                setAsks(null);
              }}
              placeholder="vieux/sshfs"
              autoFocus
            />
          </Field>
          {asks === null ? (
            <div className="flex justify-end gap-2">
              <Button onClick={close}>{t("common.cancel")}</Button>
              <Button
                variant="primary"
                disabled={!remote.trim() || review.isPending}
                onClick={() => review.mutate(remote.trim(), { onSuccess: setAsks })}
              >
                {t("plugins.review")}
              </Button>
            </div>
          ) : (
            <>
              <div className="rounded-lg border border-amber p-3 text-sm">
                <p className="mb-2 font-medium text-amber">{t("plugins.privilegesTitle")}</p>
                {asks.length === 0 && <p className="text-dim">{t("plugins.noPrivileges")}</p>}
                <ul className="flex flex-col gap-1">
                  {asks.map((a) => (
                    <li key={a.name} className="font-mono text-xs">
                      <span className="text-accent">{a.name}</span>: {a.value.join(", ") || "—"}
                      {a.description && (
                        <span className="block font-sans text-dim">{a.description}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex justify-end gap-2">
                <Button onClick={close}>{t("common.cancel")}</Button>
                <Button
                  variant="primary"
                  disabled={install.isPending}
                  onClick={() => (install.mutate(undefined), close())}
                >
                  {t("plugins.accept")}
                </Button>
              </div>
            </>
          )}
        </div>
      </Dialog>
      <ConfirmDialog
        open={target !== null}
        title={t("plugins.removeTitle", { name: target?.name ?? "" })}
        confirmLabel={t("common.delete")}
        body={t("plugins.removeBody")}
        onConfirm={() => target && remove.mutate(target)}
        onClose={() => setTarget(null)}
      />
    </section>
  );
}
