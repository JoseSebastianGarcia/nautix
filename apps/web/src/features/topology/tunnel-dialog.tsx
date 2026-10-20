import { type Container, type Network, tunnelFromContainer } from "@nautix/contracts";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../app/api.js";
import { keys } from "../../app/queries.js";
import { useApiMutation } from "../../app/use-api-mutation.js";
import { Button, Dialog, Field, Input, ShowCommand } from "../../components/ui.js";

export interface TunnelTarget {
  from: Network;
  to: Network;
}

const validPort = (v: string): boolean => /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 65535;

export function TunnelDialog({
  target,
  containers,
  onClose,
}: {
  target: TunnelTarget | null;
  containers: Container[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog
      open={target !== null}
      onClose={onClose}
      title={target ? t("tunnel.dialogTitle", { from: target.from.name, to: target.to.name }) : ""}
    >
      {target && <TunnelForm target={target} containers={containers} onClose={onClose} />}
    </Dialog>
  );
}

function TunnelForm({
  target,
  containers,
  onClose,
}: {
  target: TunnelTarget;
  containers: Container[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  // Only real services on the destination network can be the target (not other tunnels).
  const candidates = containers.filter(
    (c) => c.networks.includes(target.to.name) && tunnelFromContainer(c) === null,
  );
  const [targetId, setTargetId] = useState(candidates[0]?.id ?? "");
  const chosen = candidates.find((c) => c.id === targetId);
  const suggested = chosen?.ports[0]?.privatePort;
  const [port, setPort] = useState(suggested ? String(suggested) : "");
  const [listen, setListen] = useState("");

  const create = useApiMutation(
    () =>
      api.createTunnel({
        fromNetworkId: target.from.id,
        toNetworkId: target.to.id,
        targetContainerId: targetId,
        targetPort: Number(port),
        ...(listen ? { listenPort: Number(listen) } : {}),
      }),
    [keys.containers, keys.networks],
    undefined,
    () => t("toast.openingTunnel"),
  );

  const effectiveListen = listen || port;
  const valid = chosen && validPort(port) && (listen === "" || validPort(listen));
  const name = `tunnel-${target.from.name}-to-${target.to.name}-${effectiveListen}`;
  const command = chosen
    ? [
        `docker run -d --name ${name} --network ${target.from.name} alpine/socat:1.8.1.1 TCP-LISTEN:${effectiveListen},fork,reuseaddr TCP:${chosen.name}:${port}`,
        `docker network connect ${target.to.name} ${name}`,
      ].join("\n")
    : "";

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid || create.isPending) return;
        create.mutate();
        onClose();
      }}
    >
      <p className="text-sm text-dim">
        {t("tunnel.intro", { from: target.from.name, to: target.to.name })}
      </p>
      {candidates.length === 0 ? (
        <p className="text-sm text-amber">{t("tunnel.noTargets", { network: target.to.name })}</p>
      ) : (
        <>
          <Field label={t("tunnel.target")}>
            <select
              aria-label={t("tunnel.target")}
              value={targetId}
              onChange={(e) => {
                setTargetId(e.target.value);
                const next = candidates.find((c) => c.id === e.target.value)?.ports[0]?.privatePort;
                setPort(next ? String(next) : "");
              }}
              className="rounded-lg border border-line bg-bg0 px-2 py-2 text-sm text-fg"
            >
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("tunnel.targetPort")}>
            <Input
              inputMode="numeric"
              value={port}
              onChange={(e) => setPort(e.target.value.replace(/\D/g, ""))}
              aria-invalid={port !== "" && !validPort(port)}
              required
            />
          </Field>
          <Field label={t("tunnel.listenPort")} hint={t("tunnel.listenHint")}>
            <Input
              inputMode="numeric"
              value={listen}
              placeholder={port}
              onChange={(e) => setListen(e.target.value.replace(/\D/g, ""))}
              aria-invalid={listen !== "" && !validPort(listen)}
            />
          </Field>
          <p className="rounded-lg border border-line bg-bg2 p-3 text-xs text-dim">
            {t("tunnel.scope", { from: target.from.name, port: effectiveListen || "…" })}
          </p>
          <ShowCommand command={command} />
        </>
      )}
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>{t("common.cancel")}</Button>
        <Button variant="primary" type="submit" disabled={!valid || create.isPending}>
          {t("tunnel.create")}
        </Button>
      </div>
    </form>
  );
}
