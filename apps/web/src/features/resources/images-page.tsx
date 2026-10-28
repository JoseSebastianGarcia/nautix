import type { Image } from "@nautix/contracts";
import { Braces, Download, History, Search, Tag, Trash2, Upload, UploadCloud } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../app/api.js";
import { cli } from "../../app/cli.js";
import { keys, useImages, useIsAdmin } from "../../app/queries.js";
import { useApiMutation } from "../../app/use-api-mutation.js";
import { useListSelection } from "../../app/use-list-selection.js";
import { BulkDeleteBar } from "../../components/bulk-delete.js";
import { InspectDialog } from "../../components/inspect-dialog.js";
import { Button, ConfirmDialog, Dialog, Field, Input, ShowCommand } from "../../components/ui.js";
import { formatBytes, formatDate } from "./format.js";
import {
  ArchiveDialog,
  HistoryDialog,
  PushDialog,
  SearchDialog,
  TagDialog,
} from "./image-dialogs.js";
import { PageHeader, RowCheck, Table, Td } from "./table.js";

export function ImagesPage() {
  const { t, i18n } = useTranslation();
  const { data = [] } = useImages();
  const sel = useListSelection(data, (i) => i.id);
  const [target, setTarget] = useState<Image | null>(null);
  const [pulling, setPulling] = useState(false);
  const [reference, setReference] = useState("");
  const isAdmin = useIsAdmin();
  const [tagging, setTagging] = useState<Image | null>(null);
  const [history, setHistory] = useState<Image | null>(null);
  const [pushing, setPushing] = useState<Image | null>(null);
  const [searching, setSearching] = useState(false);
  const [archive, setArchive] = useState<"load" | "import" | null>(null);
  const [inspecting, setInspecting] = useState<Image | null>(null);
  const pull = useApiMutation(
    (ref: string) => api.pullImage(ref),
    [keys.images],
    () => t("toast.pulled"),
    (ref) => t("toast.pulling", { ref }),
  );
  const remove = useApiMutation((id: string) => api.removeImage(id, false), [keys.images]);
  const name = (i: Image) => i.tags[0] ?? t("images.untagged");

  return (
    <div className="p-6">
      <PageHeader
        title={t("images.title")}
        actions={
          <>
            <Button onClick={() => setSearching(true)}>
              <Search size={14} /> {t("images.search")}
            </Button>
            <Button write onClick={() => setArchive("load")}>
              <Upload size={14} /> {t("images.load")}
            </Button>
            <Button write onClick={() => setArchive("import")}>
              <Upload size={14} /> {t("images.import")}
            </Button>
            <Button write variant="primary" onClick={() => setPulling(true)}>
              <Download size={14} /> {t("images.pull")}
            </Button>
          </>
        }
      />
      <BulkDeleteBar
        items={sel.rows.map((i) => ({
          kind: "images" as const,
          id: i.id,
          name: name(i),
          size: i.size,
        }))}
        invalidate={[keys.images]}
        onDone={sel.clear}
        onClear={sel.clear}
      />
      <Table
        selection={sel.table(t("bulk.selectAll"))}
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
            <RowCheck
              checked={sel.has(i.id)}
              onChange={() => sel.toggle(i.id)}
              label={t("bulk.selectRow", { name: name(i) })}
            />
            <Td mono>
              {i.tags.length === 0 ? (
                t("images.untagged")
              ) : (
                <ul className="flex flex-col gap-0.5">
                  {i.tags.map((tag) => (
                    <li key={tag}>{tag}</li>
                  ))}
                </ul>
              )}
            </Td>
            <Td>{formatBytes(i.size)}</Td>
            <Td>{formatDate(i.createdAt, i18n.language)}</Td>
            <Td>{i.inUse ? t("common.inUse") : t("common.unused")}</Td>
            <Td>
              <div className="flex gap-1">
                <Button
                  aria-label={`${t("images.inspect")} ${name(i)}`}
                  title={t("images.inspect")}
                  onClick={() => setInspecting(i)}
                >
                  <Braces size={14} />
                </Button>
                <Button
                  aria-label={`${t("images.history")} ${name(i)}`}
                  title={t("images.history")}
                  onClick={() => setHistory(i)}
                >
                  <History size={14} />
                </Button>
                <Button
                  write
                  aria-label={`${t("images.tag")} ${name(i)}`}
                  title={t("images.tag")}
                  onClick={() => setTagging(i)}
                >
                  <Tag size={14} />
                </Button>
                {isAdmin && (
                  <a
                    href={`/api/v1/images/save?ref=${encodeURIComponent(i.tags[0] ?? i.id)}`}
                    download
                    aria-label={`${t("images.save")} ${name(i)}`}
                    title={t("images.save")}
                    className="inline-flex items-center rounded-lg border border-line bg-bg1 px-3 py-1.5 hover:bg-bg2"
                  >
                    <Download size={14} />
                  </a>
                )}
                <Button
                  write
                  disabled={i.tags.length === 0}
                  aria-label={`${t("images.push")} ${name(i)}`}
                  title={t("images.push")}
                  onClick={() => setPushing(i)}
                >
                  <UploadCloud size={14} />
                </Button>
                <Button
                  write
                  variant="danger"
                  disabled={i.inUse}
                  aria-label={`${t("common.delete")} ${name(i)}`}
                  onClick={() => setTarget(i)}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            </Td>
          </tr>
        ))}
      </Table>
      <TagDialog image={tagging} onClose={() => setTagging(null)} />
      <HistoryDialog image={history} onClose={() => setHistory(null)} />
      <PushDialog image={pushing} onClose={() => setPushing(null)} />
      <SearchDialog open={searching} onClose={() => setSearching(false)} />
      <ArchiveDialog mode={archive} onClose={() => setArchive(null)} />
      <InspectDialog
        target={
          inspecting
            ? {
                title: `${t("images.inspect")}: ${name(inspecting)}`,
                command: `docker image inspect ${name(inspecting)}`,
                key: inspecting.id,
                load: () => api.inspectImage(inspecting.tags[0] ?? inspecting.id),
              }
            : null
        }
        onClose={() => setInspecting(null)}
      />
      <ConfirmDialog
        open={target !== null}
        title={t("images.removeTitle")}
        confirmLabel={t("common.delete")}
        requireText={target ? name(target) : ""}
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
            pull.mutate(reference);
            setPulling(false);
            setReference("");
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
