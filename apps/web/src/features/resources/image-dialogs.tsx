import type { Image } from "@nautix/contracts";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../app/api.js";
import { keys } from "../../app/queries.js";
import { useApiMutation } from "../../app/use-api-mutation.js";
import { useToasts } from "../../components/toast-store.js";
import { Button, Dialog, Field, Input, ShowCommand } from "../../components/ui.js";
import { formatBytes, formatDate } from "./format.js";

const REF = /^[a-zA-Z0-9][a-zA-Z0-9_.:/@-]*$/;
const TAG = /^[\w][\w.-]{0,127}$/;

export function TagDialog({ image, onClose }: { image: Image | null; onClose: () => void }) {
  const { t } = useTranslation();
  const [repo, setRepo] = useState("");
  const [tag, setTag] = useState("latest");
  const ref = image?.tags[0] ?? image?.id ?? "";
  const mutation = useApiMutation(
    () => api.tagImage(ref, repo, tag),
    [keys.images],
    () => t("toast.done"),
  );
  const valid = REF.test(repo) && TAG.test(tag);
  return (
    <Dialog open={image !== null} onClose={onClose} title={t("images.tag")}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) mutation.mutate(undefined, { onSuccess: onClose });
        }}
      >
        <p className="font-mono text-xs text-dim">{ref}</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("details.repository")}>
            <Input
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              placeholder="myorg/app"
              autoFocus
              aria-invalid={repo !== "" && !REF.test(repo)}
            />
          </Field>
          <Field label="Tag">
            <Input
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              aria-invalid={!TAG.test(tag)}
            />
          </Field>
        </div>
        <ShowCommand command={`docker tag ${ref} ${repo || "<repository>"}:${tag}`} />
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="primary" type="submit" disabled={!valid || mutation.isPending}>
            {t("images.tag")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function HistoryDialog({ image, onClose }: { image: Image | null; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const ref = image?.tags[0] ?? image?.id ?? "";
  const history = useQuery({
    queryKey: ["image-history", ref],
    queryFn: () => api.imageHistory(ref),
    enabled: image !== null,
  });
  return (
    <Dialog open={image !== null} onClose={onClose} title={t("images.history")}>
      <div className="max-h-[55vh] overflow-auto rounded-lg border border-line">
        <table className="w-full text-left font-mono text-xs">
          <thead className="border-b border-line text-dim">
            <tr>
              <th className="px-3 py-2">{t("common.created")}</th>
              <th className="px-3 py-2">{t("images.createdBy")}</th>
              <th className="px-3 py-2">{t("common.size")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {(history.data ?? []).map((h, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: layers repeat ids ("<missing>")
              <tr key={i}>
                <td className="px-3 py-1.5 whitespace-nowrap">
                  {formatDate(h.createdAt, i18n.language)}
                </td>
                <td className="px-3 py-1.5 break-all">{h.createdBy}</td>
                <td className="px-3 py-1.5 whitespace-nowrap">{formatBytes(h.size)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ShowCommand command={`docker history ${ref}`} />
      <div className="flex justify-end">
        <Button onClick={onClose}>{t("common.close")}</Button>
      </div>
    </Dialog>
  );
}

export function PushDialog({ image, onClose }: { image: Image | null; onClose: () => void }) {
  const { t } = useTranslation();
  const push = useToasts((s) => s.push);
  const ref = image?.tags[0] ?? "";
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [server, setServer] = useState("");
  const [output, setOutput] = useState("");
  const auth =
    user && password
      ? { username: user, password, ...(server ? { serveraddress: server } : {}) }
      : undefined;
  const test = useApiMutation(
    () => api.testRegistry(auth ?? { username: "", password: "" }),
    [],
    undefined,
  );
  const mutation = useApiMutation(
    () => api.pushImage(ref, auth),
    [],
    undefined,
    () => t("images.pushing", { ref }),
  );
  return (
    <Dialog open={image !== null} onClose={onClose} title={t("images.push")}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate(undefined, {
            onSuccess: (r) => {
              setOutput(r.output);
              setPassword("");
              push("ok", t("images.pushed", { ref }));
            },
          });
        }}
      >
        <p className="font-mono text-xs text-dim">{ref}</p>
        <p className="text-xs text-amber">{t("images.credentialsNote")}</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("auth.username")}>
            <Input value={user} onChange={(e) => setUser(e.target.value)} autoComplete="off" />
          </Field>
          <Field label={t("auth.password")}>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </Field>
        </div>
        <Field label={t("images.registryServer")} hint={t("images.registryHint")}>
          <Input value={server} onChange={(e) => setServer(e.target.value)} placeholder="ghcr.io" />
        </Field>
        {output && (
          <pre className="max-h-40 overflow-auto rounded-lg border border-line bg-bg0 p-2 font-mono text-xs whitespace-pre-wrap">
            {output}
          </pre>
        )}
        <ShowCommand command={`docker push ${ref}`} />
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>{t("common.close")}</Button>
          <Button
            disabled={!auth || test.isPending}
            onClick={() => test.mutate(undefined, { onSuccess: (r) => push("ok", r.status) })}
          >
            {t("images.testLogin")}
          </Button>
          <Button variant="primary" type="submit" disabled={mutation.isPending || !ref}>
            {t("images.push")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [term, setTerm] = useState("");
  const [submitted, setSubmitted] = useState("");
  const results = useQuery({
    queryKey: ["image-search", submitted],
    queryFn: () => api.searchImages(submitted),
    enabled: submitted !== "",
  });
  const pull = useApiMutation(
    (ref: string) => api.pullImage(ref),
    [keys.images],
    () => t("toast.pulled"),
    (ref) => t("toast.pulling", { ref }),
  );
  return (
    <Dialog open={open} onClose={onClose} title={t("images.search")}>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(term.trim());
        }}
      >
        <Input
          aria-label={t("images.search")}
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="nginx"
          autoFocus
        />
        <Button variant="primary" type="submit" disabled={term.trim() === ""}>
          {t("images.search")}
        </Button>
      </form>
      <ul className="flex max-h-[50vh] flex-col gap-2 overflow-auto">
        {results.isLoading && <li className="text-sm text-dim">{t("common.loading")}</li>}
        {(results.data ?? []).map((r) => (
          <li key={r.name} className="flex items-center gap-3 rounded-lg border border-line p-2">
            <div className="min-w-0 flex-1">
              <div className="font-mono text-sm">
                {r.name}{" "}
                {r.official && (
                  <span className="rounded bg-accent-soft px-1 text-[10px] text-accent">
                    {t("images.official")}
                  </span>
                )}
              </div>
              <div className="truncate text-xs text-dim">{r.description}</div>
            </div>
            <span className="text-xs text-dim">★ {r.stars}</span>
            <Button write onClick={() => pull.mutate(r.name)}>
              {t("images.pull")}
            </Button>
          </li>
        ))}
        {results.data?.length === 0 && <li className="text-sm text-dim">{t("common.empty")}</li>}
      </ul>
      <ShowCommand command={`docker search ${submitted || "<term>"}`} />
      <div className="flex justify-end">
        <Button onClick={onClose}>{t("common.close")}</Button>
      </div>
    </Dialog>
  );
}

export function ArchiveDialog({
  mode,
  onClose,
}: {
  mode: "load" | "import" | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [repo, setRepo] = useState("");
  const [tag, setTag] = useState("latest");
  const upload = useApiMutation(
    () =>
      api.uploadImageTar(
        mode === "load"
          ? "/images/load"
          : `/images/import?repository=${encodeURIComponent(repo)}&tag=${encodeURIComponent(tag)}`,
        file as File,
      ),
    [keys.images],
    () => t("toast.done"),
    () => t("images.uploading"),
  );
  const valid = file !== null && (mode === "load" || (REF.test(repo) && TAG.test(tag)));
  return (
    <Dialog
      open={mode !== null}
      onClose={onClose}
      title={mode === "load" ? t("images.load") : t("images.import")}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid || upload.isPending) return;
          upload.mutate();
          onClose();
        }}
      >
        <p className="text-sm text-dim">
          {mode === "load" ? t("images.loadHint") : t("images.importHint")}
        </p>
        <input
          type="file"
          accept=".tar,.tar.gz,application/x-tar"
          aria-label={t("images.chooseFile")}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        {mode === "import" && (
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("details.repository")}>
              <Input
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                placeholder="rootfs/demo"
              />
            </Field>
            <Field label="Tag">
              <Input value={tag} onChange={(e) => setTag(e.target.value)} />
            </Field>
          </div>
        )}
        <ShowCommand
          command={
            mode === "load"
              ? "docker load -i archive.tar"
              : `docker import archive.tar ${repo || "<repository>"}:${tag}`
          }
        />
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="primary" type="submit" disabled={!valid}>
            {mode === "load" ? t("images.load") : t("images.import")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
