import type { Container, ContainerAction } from "@nautix/contracts";
import { Play, RotateCw, Square, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../app/api.js";
import { cli } from "../../app/cli.js";
import { keys, useContainers } from "../../app/queries.js";
import { useApiMutation } from "../../app/use-api-mutation.js";
import { Button, ConfirmDialog } from "../../components/ui.js";
import { LogoBadge } from "../topology/logo-badge.js";
import { PageHeader, Table, Td } from "./table.js";

export function ContainersPage() {
  const { t } = useTranslation();
  const { data = [] } = useContainers();
  const [target, setTarget] = useState<Container | null>(null);
  const act = useApiMutation(
    ({ id, action }: { id: string; action: ContainerAction }) => api.containerAction(id, action),
    [keys.containers],
  );
  const remove = useApiMutation(
    (id: string) => api.removeContainer(id, true),
    [keys.containers, keys.networks],
  );

  return (
    <div className="p-6">
      <PageHeader title={t("containers.title")} />
      <Table
        head={[
          t("common.name"),
          t("common.image"),
          t("common.status"),
          t("common.ports"),
          t("common.networks"),
          t("common.actions"),
        ]}
        empty={data.length === 0}
      >
        {data.map((c) => (
          <tr key={c.id}>
            <Td>
              <span className="flex items-center gap-2 font-medium">
                <LogoBadge image={c.image} name={c.name} size={28} />
                {c.name}
              </span>
            </Td>
            <Td mono>{c.image}</Td>
            <Td>
              {t(`containers.state.${c.state}`)} <span className="text-dim">· {c.status}</span>
            </Td>
            <Td mono>
              {c.ports
                .filter((p) => p.publicPort)
                .map((p) => `${p.ip ?? "0.0.0.0"}:${p.publicPort}→${p.privatePort}`)
                .join(", ") || "—"}
            </Td>
            <Td mono>{c.networks.join(", ") || "—"}</Td>
            <Td>
              <div className="flex gap-1">
                {c.state === "running" ? (
                  <>
                    <Button
                      aria-label={`${t("containers.stop")} ${c.name}`}
                      title={cli.containerAction("stop", c.name)}
                      onClick={() => act.mutate({ id: c.id, action: "stop" })}
                    >
                      <Square size={14} />
                    </Button>
                    <Button
                      aria-label={`${t("containers.restart")} ${c.name}`}
                      title={cli.containerAction("restart", c.name)}
                      onClick={() => act.mutate({ id: c.id, action: "restart" })}
                    >
                      <RotateCw size={14} />
                    </Button>
                  </>
                ) : (
                  <Button
                    aria-label={`${t("containers.start")} ${c.name}`}
                    title={cli.containerAction("start", c.name)}
                    onClick={() => act.mutate({ id: c.id, action: "start" })}
                  >
                    <Play size={14} />
                  </Button>
                )}
                <Button
                  variant="danger"
                  aria-label={`${t("containers.remove")} ${c.name}`}
                  onClick={() => setTarget(c)}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            </Td>
          </tr>
        ))}
      </Table>
      <ConfirmDialog
        open={target !== null}
        title={t("topology.removeContainerTitle", { name: target?.name ?? "" })}
        body={t("topology.removeContainerBody", { image: target?.image ?? "" })}
        command={target ? cli.removeContainer(target.name, true) : ""}
        onConfirm={() => target && remove.mutate(target.id)}
        onClose={() => setTarget(null)}
      />
    </div>
  );
}
