import type { VolumeEntry } from "@nautix/contracts";
import { useQuery } from "@tanstack/react-query";
import { File, Folder, Link2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../app/api.js";
import { Button, Dialog } from "../../components/ui.js";

const join = (base: string, name: string): string =>
  base === "/" ? `/${name}` : `${base}/${name}`;
const parent = (path: string): string => path.replace(/\/[^/]+$/, "") || "/";
const bytes = (n: number): string =>
  n < 1024
    ? `${n} B`
    : n < 1024 * 1024
      ? `${(n / 1024).toFixed(1)} KB`
      : `${(n / 1024 / 1024).toFixed(1)} MB`;

/** Read-only browser for a volume (admin only): folders to navigate, text files to view. */
export function VolumeBrowser({ volume, onClose }: { volume: string | null; onClose: () => void }) {
  const { t } = useTranslation();
  const [path, setPath] = useState("/");
  const [file, setFile] = useState<string | null>(null);
  const listing = useQuery({
    queryKey: ["volume-browse", volume, path],
    queryFn: () => api.browseVolume(volume ?? "", path, false),
    enabled: volume !== null && file === null,
    retry: false,
  });
  const content = useQuery({
    queryKey: ["volume-file", volume, file],
    queryFn: () => api.browseVolume(volume ?? "", file ?? "/", true),
    enabled: volume !== null && file !== null,
    retry: false,
  });
  const close = () => {
    setPath("/");
    setFile(null);
    onClose();
  };
  const open = (e: VolumeEntry) => {
    if (e.kind === "dir") setPath(join(path, e.name));
    else if (e.kind === "file") setFile(join(path, e.name));
  };
  const shown = file ?? path;

  return (
    <Dialog
      open={volume !== null}
      onClose={close}
      title={`${t("volumes.browse")}: ${volume ?? ""}`}
    >
      <div className="flex flex-col gap-3">
        <p className="break-all font-mono text-xs text-dim">{shown}</p>
        <p className="text-xs text-dim">{t("volumes.browseHint")}</p>
        {file === null ? (
          <>
            {path !== "/" && (
              <Button className="w-fit" onClick={() => setPath(parent(path))}>
                ← {t("volumes.up")}
              </Button>
            )}
            {listing.isError && <p className="text-sm text-danger">{t("errors.generic")}</p>}
            <ul className="max-h-80 overflow-auto rounded-lg border border-line text-sm">
              {listing.data?.kind === "directory" && listing.data.entries.length === 0 && (
                <li className="p-3 text-dim">{t("common.empty")}</li>
              )}
              {listing.data?.kind === "directory" &&
                listing.data.entries.map((e) => (
                  <li key={e.name} className="border-b border-line last:border-0">
                    <button
                      type="button"
                      onClick={() => open(e)}
                      disabled={e.kind !== "dir" && e.kind !== "file"}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-accent-soft disabled:opacity-60"
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
                        <span className="text-xs text-dim">{bytes(e.size)}</span>
                      )}
                    </button>
                  </li>
                ))}
            </ul>
          </>
        ) : (
          <>
            <Button className="w-fit" onClick={() => setFile(null)}>
              ← {t("volumes.up")}
            </Button>
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
    </Dialog>
  );
}
