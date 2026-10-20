import { type Container, type RestartPolicy, tunnelFromContainer } from "@nautix/contracts";
import { Lock, Pause, Play, RotateCw, Skull, Square, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { api } from "../../app/api.js";
import { cli } from "../../app/cli.js";
import { keys, useIsAdmin } from "../../app/queries.js";
import { useApiMutation } from "../../app/use-api-mutation.js";
import { useToasts } from "../../components/toast-store.js";
import { Button, ConfirmDialog, Field, Input, ShowCommand } from "../../components/ui.js";
import { Card, SIGNALS } from "./panels.js";

const REFRESH = [keys.containers, keys.networks];

export function ActionsPanel({ container: c }: { container: Container }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const push = useToasts((s) => s.push);
  const isAdmin = useIsAdmin();
  const locked = c.isSelf === true;
  const running = c.state === "running";
  const paused = c.state === "paused";
  const done = () => t("toast.done");

  const [timeout, setTimeoutSeconds] = useState("10");
  const [signal, setSignal] = useState("SIGKILL");
  const [name, setName] = useState(c.name);
  const [restart, setRestart] = useState<RestartPolicy>("unless-stopped");
  const [memory, setMemory] = useState("");
  const [cpus, setCpus] = useState("");
  const [repo, setRepo] = useState("");
  const [tag, setTag] = useState("latest");
  const [confirmRemove, setConfirmRemove] = useState(false);

  const act = useApiMutation(
    (v: { action: Parameters<typeof api.containerAction>[1]; signal?: string; timeout?: number }) =>
      api.containerAction(c.id, v.action, {
        ...(v.signal ? { signal: v.signal } : {}),
        ...(v.timeout !== undefined ? { timeout: v.timeout } : {}),
      }),
    REFRESH,
    done,
  );
  const rename = useApiMutation(() => api.renameContainer(c.id, name), REFRESH, done);
  const update = useApiMutation(
    () =>
      api.updateContainer(c.id, {
        restartPolicy: restart,
        ...(memory !== "" ? { memoryMb: Number(memory) } : {}),
        ...(cpus !== "" ? { cpus: Number(cpus) } : {}),
      }),
    REFRESH,
    done,
  );
  const wait = useApiMutation(() => api.waitContainer(c.id, 30), []);
  const commit = useApiMutation(
    () => api.commitContainer(c.id, { repository: repo, tag }),
    [keys.images],
    () => t("details.committed", { ref: `${repo}:${tag}` }),
  );
  const remove = useApiMutation(() => api.removeContainer(c.id, true), REFRESH);

  const isTunnel = tunnelFromContainer(c) !== null;
  const memValid = memory === "" || /^\d+$/.test(memory);
  const cpuValid = cpus === "" || (!Number.isNaN(Number(cpus)) && Number(cpus) >= 0);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {locked && (
        <p className="flex items-start gap-2 rounded-lg border border-line bg-bg2 p-3 text-sm text-amber lg:col-span-2">
          <Lock size={16} className="mt-0.5 shrink-0" /> {t("self.lockedNote")}
        </p>
      )}

      <Card title={t("details.lifecycle")}>
        <div className="flex flex-wrap items-end gap-2">
          {running || paused ? (
            <>
              <Button
                write
                disabled={locked || act.isPending}
                onClick={() => act.mutate({ action: "stop", timeout: Number(timeout) })}
              >
                <Square size={14} /> {t("containers.stop")}
              </Button>
              <Button
                write
                disabled={locked || act.isPending}
                onClick={() => act.mutate({ action: "restart", timeout: Number(timeout) })}
              >
                <RotateCw size={14} /> {t("containers.restart")}
              </Button>
              {paused ? (
                <Button write onClick={() => act.mutate({ action: "unpause" })}>
                  <Play size={14} /> {t("containers.unpause")}
                </Button>
              ) : (
                <Button write disabled={locked} onClick={() => act.mutate({ action: "pause" })}>
                  <Pause size={14} /> {t("containers.pause")}
                </Button>
              )}
            </>
          ) : (
            <Button write variant="primary" onClick={() => act.mutate({ action: "start" })}>
              <Play size={14} /> {t("containers.start")}
            </Button>
          )}
        </div>
        <Field label={t("details.stopTimeout")} hint={t("details.stopTimeoutHint")}>
          <Input
            inputMode="numeric"
            value={timeout}
            onChange={(e) => setTimeoutSeconds(e.target.value.replace(/\D/g, ""))}
            className="w-28"
          />
        </Field>
        <div className="flex flex-wrap items-end gap-2">
          <Field label={t("details.signal")}>
            <select
              aria-label={t("details.signal")}
              value={signal}
              onChange={(e) => setSignal(e.target.value)}
              className="rounded-lg border border-line bg-bg0 px-2 py-2 text-sm text-fg"
            >
              {SIGNALS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Button
            write
            variant="danger"
            disabled={locked || !running}
            onClick={() => act.mutate({ action: "kill", signal })}
          >
            <Skull size={14} /> {t("containers.kill")}
          </Button>
        </div>
        <ShowCommand
          command={[
            `docker stop -t ${timeout || 10} ${c.name}`,
            `docker kill -s ${signal} ${c.name}`,
          ].join("\n")}
        />
      </Card>

      <Card title={t("details.rename")}>
        <Field label={t("common.name")}>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            pattern="[a-zA-Z0-9][a-zA-Z0-9_.\-]*"
          />
        </Field>
        <Button
          write
          disabled={locked || name === c.name || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(name)}
          onClick={() => rename.mutate()}
        >
          {t("details.rename")}
        </Button>
        <ShowCommand command={`docker rename ${c.name} ${name}`} />
      </Card>

      <Card title={t("details.resources")}>
        <Field label={t("topology.restartPolicy")}>
          <select
            aria-label={t("topology.restartPolicy")}
            value={restart}
            onChange={(e) => setRestart(e.target.value as RestartPolicy)}
            className="rounded-lg border border-line bg-bg0 px-2 py-2 text-sm text-fg"
          >
            {(["unless-stopped", "always", "on-failure", "no"] as const).map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("details.memoryMb")} hint={t("details.zeroUnlimited")}>
            <Input
              inputMode="numeric"
              value={memory}
              onChange={(e) => setMemory(e.target.value.replace(/\D/g, ""))}
              aria-invalid={!memValid}
            />
          </Field>
          <Field label="CPUs" hint={t("details.zeroUnlimited")}>
            <Input
              inputMode="decimal"
              value={cpus}
              onChange={(e) => setCpus(e.target.value)}
              aria-invalid={!cpuValid}
            />
          </Field>
        </div>
        <Button write disabled={locked || !memValid || !cpuValid} onClick={() => update.mutate()}>
          {t("details.apply")}
        </Button>
        <ShowCommand
          command={`docker update --restart ${restart}${memory !== "" ? ` -m ${memory}m` : ""}${cpus !== "" ? ` --cpus ${cpus}` : ""} ${c.name}`}
        />
      </Card>

      <Card title={t("details.commit")}>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("details.repository")}>
            <Input value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="my/image" />
          </Field>
          <Field label="Tag">
            <Input value={tag} onChange={(e) => setTag(e.target.value)} />
          </Field>
        </div>
        <Button
          write
          disabled={locked || repo.trim() === "" || tag.trim() === ""}
          onClick={() => commit.mutate()}
        >
          {t("details.createImage")}
        </Button>
        <p className="text-xs text-dim">{t("details.commitNote")}</p>
        <ShowCommand command={`docker commit ${c.name} ${repo || "<repository>"}:${tag}`} />
      </Card>

      <Card title={t("details.more")}>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            disabled={wait.isPending}
            onClick={() =>
              wait.mutate(undefined, {
                onSuccess: (r) =>
                  push(
                    "ok",
                    r.exited
                      ? t("details.exited", { code: r.statusCode ?? 0 })
                      : t("details.stillRunning"),
                  ),
              })
            }
          >
            {t("details.wait")}
          </Button>
          {isAdmin && !locked && (
            <a
              href={`/api/v1/containers/${c.id}/export`}
              download
              className="inline-flex items-center rounded-lg border border-line bg-bg1 px-3 py-1.5 text-sm font-medium hover:bg-bg2"
            >
              {t("details.export")}
            </a>
          )}
          <Button write variant="danger" disabled={locked} onClick={() => setConfirmRemove(true)}>
            <Trash2 size={14} /> {t("containers.remove")}
          </Button>
        </div>
        {isTunnel && <p className="text-xs text-dim">{t("details.isTunnel")}</p>}
        <ShowCommand
          command={[
            `docker wait ${c.name}`,
            `docker export -o ${c.name}.tar ${c.name}`,
            cli.removeContainer(c.name, true),
          ].join("\n")}
        />
      </Card>

      <ConfirmDialog
        open={confirmRemove}
        title={t("topology.removeContainerTitle", { name: c.name })}
        body={t("topology.removeContainerBody", { image: c.image })}
        command={cli.removeContainer(c.name, true)}
        onConfirm={() => remove.mutate(undefined, { onSuccess: () => navigate("/containers") })}
        onClose={() => setConfirmRemove(false)}
      />
    </div>
  );
}
