import type { Image } from "@nautix/contracts";
import { Download, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../app/api.js";
import { cli } from "../../app/cli.js";
import { keys, useImages } from "../../app/queries.js";
import { useApiMutation } from "../../app/use-api-mutation.js";
import { Button, ConfirmDialog, Dialog, Field, Input, ShowCommand } from "../../components/ui.js";
import { formatBytes, formatDate } from "./format.js";
import { PageHeader, Table, Td } from "./table.js";

export function ImagesPage() {
  const { t, i18n } = useTranslation();
  const { data = [] } = useImages();
  const [target, setTarget] = useState<Image | null>(null);
  const [pulling, setPulling] = useState(false);
  const [reference, setReference] = useState("");
  const pull = useApiMutation(
    (ref: string) => api.pullImage(ref),
    [keys.images],
    () => t("toast.pulled"),
  );
  const remove = useApiMutation((id: string) => api.removeImage(id, false), [keys.images]);
  const name = (i: Image) => i.tags[0] ?? t("images.untagged");

  return (
    <div className="p-6">
      <PageHeader
        title={t("images.title")}
        actions={
          <Button write variant="primary" onClick={() => setPulling(true)}>
            <Download size={14} /> {t("images.pull")}
          </Button>
        }
      />
      <Table
        head={[
          t("common.tags"),
          t("common.size"),
          t("common.created"),
          t("common.status"),
          t("common.actions"),
        ]}
        empty={data.length === 0}
      >
        {data.map((i) => (
          <tr key={i.id}>
            <Td mono>{name(i)}</Td>
            <Td>{formatBytes(i.size)}</Td>
            <Td>{formatDate(i.createdAt, i18n.language)}</Td>
            <Td>{i.inUse ? t("common.inUse") : t("common.unused")}</Td>
            <Td>
              <Button
                write
                variant="danger"
                disabled={i.inUse}
                aria-label={`${t("common.delete")} ${name(i)}`}
                onClick={() => setTarget(i)}
              >
                <Trash2 size={14} />
              </Button>
            </Td>
          </tr>
        ))}
      </Table>
      <ConfirmDialog
        open={target !== null}
        title={t("images.removeTitle")}
        body={t("images.removeBody", { name: target ? name(target) : "" })}
        command={target ? cli.removeImage(name(target)) : ""}
        onConfirm={() => target && remove.mutate(target.id)}
        onClose={() => setTarget(null)}
      />
      <Dialog open={pulling} onClose={() => setPulling(false)} title={t("images.pull")}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            pull.mutate(reference, {
              onSuccess: () => {
                setPulling(false);
                setReference("");
              },
            });
          }}
        >
          <Field label={t("images.reference")}>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              required
              autoFocus
            />
          </Field>
          <ShowCommand command={cli.pull(reference || "<image>")} />
          <div className="flex justify-end gap-2">
            <Button onClick={() => setPulling(false)}>{t("common.cancel")}</Button>
            <Button variant="primary" type="submit" disabled={pull.isPending}>
              {pull.isPending ? t("common.loading") : t("images.pull")}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
