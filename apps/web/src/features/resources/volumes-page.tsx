import type { Volume } from "@nautix/contracts";
import { Braces, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../app/api.js";
import { cli } from "../../app/cli.js";
import { keys, useVolumes } from "../../app/queries.js";
import { useApiMutation } from "../../app/use-api-mutation.js";
import { InspectDialog } from "../../components/inspect-dialog.js";
import { Button, ConfirmDialog, Dialog, Field, Input, ShowCommand } from "../../components/ui.js";
import { PageHeader, Table, Td } from "./table.js";

export function VolumesPage() {
  const { t } = useTranslation();
  const { data = [] } = useVolumes();
  const [target, setTarget] = useState<Volume | null>(null);
  const [creating, setCreating] = useState(false);
  const [inspecting, setInspecting] = useState<{ key: string; name: string; id: string } | null>(
    null,
  );
  const [name, setName] = useState("");
  const create = useApiMutation((n: string) => api.createVolume(n), [keys.volumes]);
  const remove = useApiMutation((n: string) => api.removeVolume(n), [keys.volumes]);

  return (
    <div className="p-6">
      <PageHeader
        title={t("volumes.title")}
        actions={
          <Button write variant="primary" onClick={() => setCreating(true)}>
            <Plus size={14} /> {t("volumes.new")}
          </Button>
        }
      />
      <Table
        head={[
          t("common.name"),
          t("common.driver"),
          t("volumes.mountpoint"),
          t("common.status"),
          t("common.actions"),
        ]}
        empty={data.length === 0}
      >
        {data.map((v) => (
          <tr key={v.name}>
            <Td mono>{v.name}</Td>
            <Td>{v.driver}</Td>
            <Td mono>{v.mountpoint}</Td>
            <Td>{v.inUse ? t("common.inUse") : t("common.unused")}</Td>
            <Td>
              <div className="flex gap-1">
                <Button
                  aria-label={`${t("images.inspect")} ${v.name}`}
                  title={t("images.inspect")}
                  onClick={() => setInspecting({ key: v.name, name: v.name, id: v.name })}
                >
                  <Braces size={14} />
                </Button>
                <Button
                  write
                  variant="danger"
                  disabled={v.inUse}
                  aria-label={`${t("common.delete")} ${v.name}`}
                  onClick={() => setTarget(v)}
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
                command: `docker volume inspect ${inspecting.name}`,
                key: `volumes:${inspecting.key}`,
                load: () => api.inspect("volumes", inspecting.id),
              }
            : null
        }
        onClose={() => setInspecting(null)}
      />
      <ConfirmDialog
        open={target !== null}
        title={t("volumes.removeTitle", { name: target?.name ?? "" })}
        body={t("volumes.removeBody")}
        command={target ? cli.removeVolume(target.name) : ""}
        onConfirm={() => target && remove.mutate(target.name)}
        onClose={() => setTarget(null)}
      />
      <Dialog open={creating} onClose={() => setCreating(false)} title={t("volumes.new")}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate(name, {
              onSuccess: () => {
                setCreating(false);
                setName("");
              },
            });
          }}
        >
          <Field label={t("common.name")}>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              pattern="[a-zA-Z0-9][a-zA-Z0-9_.\-]*"
              autoFocus
            />
          </Field>
          <ShowCommand command={cli.createVolume(name || "<name>")} />
          <div className="flex justify-end gap-2">
            <Button onClick={() => setCreating(false)}>{t("common.cancel")}</Button>
            <Button variant="primary" type="submit">
              {t("common.create")}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
