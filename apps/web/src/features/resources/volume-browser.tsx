import type { Volume, VolumeEntry } from "@nautix/contracts";
import { useQuery } from "@tanstack/react-query";
import { Download, File, Folder, Link2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../app/api.js";
import { useApiMutation } from "../../app/use-api-mutation.js";
import { Button, Dialog } from "../../components/ui.js";
import { buildTar } from "../builds/tar.js";
import { checkUpload, formatSize } from "./volume-upload.js";

const join = (base: string, name: string): string =>
  base === "/" ? `/${name}` : `${base}/${name}`;
const parent = (path: string): string => path.replace(/\/[^/]+$/, "") || "/";
const archiveUrl = (volume: string, path: string): string =>
  `/api/v1/volumes/${encodeURIComponent(volume)}/archive?path=${encodeURIComponent(path)}`;

const linkClass =
  "inline-flex items-center gap-2 rounded-lg border border-line bg-bg1 px-3 py-1.5 text-sm font-medium hover:bg-bg2";

/** Browser for a volume (admin only): navigate folders, read text files, download tars and upload files. */
export function VolumeBrowser({ volume, onClose }: { volume: Volume | null; onClose: () => void }) {
  const { t } = useTranslation();
  const [path, setPath] = useState("/");
  const [file, setFile] = useState<string | null>(null);
  const [pending, setPending] = useState<File[] | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const name = volume?.name ?? "";
  const listing = useQuery({
    queryKey: ["volume-browse", name, path],
    queryFn: () => api.browseVolume(name, path, false),
    enabled: volume !== null && file === null,
    retry: false,
  });
  const content = useQuery({
    queryKey: ["volume-file", name, file],
    queryFn: () => api.browseVolume(name, file ?? "/", true),
    enabled: volume !== null && file !== null,
    retry: false,
  });
  const upload = useApiMutation(
    (files: File[]) =>
      api.uploadToVolume(name, path, buildTar(files.map((f) => ({ path: f.name, data: f })))),
    [["volume-browse", name, path]],
    () => t("volumes.uploaded"),
  );
  const close = () => {
    setPath("/");
    setFile(null);
    setPending(null);
    onClose();
  };
  const open = (e: VolumeEntry) => {
    if (e.kind === "dir") setPath(join(path, e.name));
    else if (e.kind === "file") setFile(join(path, e.name));
  };
  const issue = pending ? checkUpload(pending) : null;

  return (
    <Dialog open={volume !== null} onClose={close} title={`${t("volumes.browse")}: ${name}`}>
      <div className="flex flex-col gap-3">
        <p className="break-all font-mono text-xs text-dim">{file ?? path}</p>
        <p className="text-xs text-dim">{t("volumes.browseHint")}</p>
        {file === null ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {path !== "/" && (
                <Button onClick={() => setPath(parent(path))}>← {t("volumes.up")}</Button>
              )}
              <a href={archiveUrl(name, path)} download className={linkClass}>
                <Download size={14} /> {t("volumes.downloadFolder")}
              </a>
              <Button write onClick={() => picker.current?.click()}>
                <Upload size={14} /> {t("volumes.upload")}
              </Button>
              <input
                ref={picker}
                type="file"
                multiple
                className="sr-only"
                aria-label={t("volumes.upload")}
                onChange={(e) => {
                  const chosen = [...(e.target.files ?? [])];
                  e.target.value = "";
                  if (chosen.length > 0) setPending(chosen);
                }}
              />
            </div>
            {listing.isError && <p className="text-sm text-danger">{t("errors.generic")}</p>}
            <ul className="max-h-80 overflow-auto rounded-lg border border-line text-sm">
              {listing.data?.kind === "directory" && listing.data.entries.length === 0 && (
                <li className="p-3 text-dim">{t("common.empty")}</li>
              )}
              {listing.data?.kind === "directory" &&
                listing.data.entries.map((e) => (
                  <li key={e.name} className="flex items-center border-b border-line last:border-0">
                    <button
                      type="button"
                      onClick={() => open(e)}
                      disabled={e.kind !== "dir" && e.kind !== "file"}
                      className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left hover:bg-accent-soft disabled:opacity-60"
                    >
                      {e.kind === "dir" ? (
                        <Folder size={14} className="text-accent" />
                      ) : e.kind === "link" ? (
                        <Link2 size={14} />
                      ) : (
                        <File size={14} />
                      )}
                      <span className="min-w-0 flex-1 truncate font-mono text-xs">{e.name}</span>
                      {e.kind === "file" && (
                        <span className="text-xs text-dim">{formatSize(e.size)}</span>
                      )}
                    </button>
                    {(e.kind === "dir" || e.kind === "file") && (
                      <a
                        href={archiveUrl(name, join(path, e.name))}
                        download
                        title={t("volumes.download")}
                        aria-label={`${t("volumes.download")}: ${e.name}`}
                        className="px-3 py-2 text-dim hover:text-accent"
                      >
                        <Download size={14} />
                      </a>
                    )}
                  </li>
                ))}
            </ul>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => setFile(null)}>← {t("volumes.up")}</Button>
              <a href={archiveUrl(name, file)} download className={linkClass}>
                <Download size={14} /> {t("volumes.download")}
              </a>
            </div>
            {content.isError && <p className="text-sm text-danger">{t("volumes.notReadable")}</p>}
            <pre className="max-h-80 overflow-auto rounded-lg border border-line bg-bg0 p-2 font-mono text-xs whitespace-pre-wrap">
              {content.data?.kind === "file" ? content.data.content : ""}
            </pre>
            {content.data?.kind === "file" && content.data.truncated && (
              <p className="text-xs text-amber">{t("volumes.truncated")}</p>
            )}
          </>
        )}
      </div>

      <Dialog
        open={pending !== null}
        onClose={() => setPending(null)}
        title={t("volumes.uploadTitle", { count: pending?.length ?? 0, path })}
      >
        <ul className="max-h-40 overflow-auto rounded-lg border border-line p-2 font-mono text-xs">
          {pending?.map((f) => (
            <li key={f.name} className="flex justify-between gap-2">
              <span className="truncate">{f.name}</span>
              <span className="text-dim">{formatSize(f.size)}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-dim">{t("volumes.uploadReplaces")}</p>
        <p className="text-xs text-dim">{t("volumes.uploadOwner")}</p>
        {volume?.inUse && <p className="text-xs text-amber">{t("volumes.uploadInUse")}</p>}
        {issue && <p className="text-xs text-danger">{t(`volumes.upload_${issue}`)}</p>}
        <div className="flex justify-end gap-2">
          <Button onClick={() => setPending(null)}>{t("common.cancel")}</Button>
          <Button
            write
            variant="primary"
            disabled={issue !== null || upload.isPending}
            onClick={() => {
              if (pending) upload.mutate(pending, { onSuccess: () => setPending(null) });
            }}
          >
            {t("volumes.uploadConfirm")}
          </Button>
        </div>
      </Dialog>
    </Dialog>
  );
}
