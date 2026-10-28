import type { Network } from "@nautix/contracts";
import { Braces, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../app/api.js";
import { cli } from "../../app/cli.js";
import { keys, useNetworks } from "../../app/queries.js";
import { useApiMutation } from "../../app/use-api-mutation.js";
import { InspectDialog } from "../../components/inspect-dialog.js";
import { Button, ConfirmDialog } from "../../components/ui.js";
import { NetworkDialog } from "../topology/network-dialog.js";
import { PageHeader, Table, Td } from "./table.js";

export function NetworksPage() {
  const { t } = useTranslation();
  const { data = [] } = useNetworks();
  const [target, setTarget] = useState<Network | null>(null);
  const [creating, setCreating] = useState(false);
  const [inspecting, setInspecting] = useState<{ key: string; name: string; id: string } | null>(
    null,
  );
  const remove = useApiMutation((id: string) => api.removeNetwork(id), [keys.networks]);

  return (
    <div className="p-6">
      <PageHeader
        title={t("networks.title")}
        actions={
          <Button write variant="primary" onClick={() => setCreating(true)}>
            <Plus size={14} /> {t("networks.new")}
          </Button>
        }
      />
      <Table
        head={[
          t("common.name"),
          t("common.driver"),
          t("networks.subnet"),
          t("networks.internal"),
          t("networks.members"),
          t("common.actions"),
        ]}
        empty={data.length === 0}
      >
        {data.map((n) => (
          <tr key={n.id}>
            <Td mono>
              {n.name} {n.system && <span className="text-dim">({t("networks.system")})</span>}
            </Td>
            <Td>{n.driver}</Td>
            <Td mono>{n.subnet ?? "—"}</Td>
            <Td>{n.internal ? t("topology.isolated") : t("topology.bridged")}</Td>
            <Td>{n.containerIds.length}</Td>
            <Td>
              <div className="flex gap-1">
                <Button
                  aria-label={`${t("images.inspect")} ${n.name}`}
                  title={t("images.inspect")}
                  onClick={() => setInspecting({ key: n.id, name: n.name, id: n.id })}
                >
                  <Braces size={14} />
                </Button>
                <Button
                  write
                  variant="danger"
                  disabled={n.system || n.containerIds.length > 0}
                  aria-label={`${t("common.delete")} ${n.name}`}
                  onClick={() => setTarget(n)}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            </Td>
          </tr>
        ))}
      </Table>
      <InspectDialog
        target={
          inspecting
            ? {
                title: `${t("images.inspect")}: ${inspecting.name}`,
                command: `docker network inspect ${inspecting.name}`,
                key: `networks:${inspecting.key}`,
                load: () => api.inspect("networks", inspecting.id),
              }
            : null
        }
        onClose={() => setInspecting(null)}
      />
      <ConfirmDialog
        open={target !== null}
        title={t("topology.removeNetworkTitle", { name: target?.name ?? "" })}
        confirmLabel={t("common.delete")}
        requireText={target?.name ?? ""}
        body={t("topology.removeNetworkBody")}
        command={target ? cli.removeNetwork(target.name) : ""}
        onConfirm={() => target && remove.mutate(target.id)}
        onClose={() => setTarget(null)}
      />
      <NetworkDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}
