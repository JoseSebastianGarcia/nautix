import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { api } from "../../app/api.js";
import { cli } from "../../app/cli.js";
import { keys, useSwarmStatus } from "../../app/queries.js";
import { useApiMutation } from "../../app/use-api-mutation.js";
import { Button, Dialog, Field, Input, ShowCommand } from "../../components/ui.js";

export function NetworkDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onClose={onClose} title={t("topology.newNetwork")}>
      {open && <NetworkForm onClose={onClose} />}
    </Dialog>
  );
}

function NetworkForm({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [internal, setInternal] = useState(true);
  const [subnet, setSubnet] = useState("");
  const [overlay, setOverlay] = useState(false);
  const [encrypted, setEncrypted] = useState(true);
  const [attachable, setAttachable] = useState(false);
  // The choice between a local network and an overlay only exists when this engine is in a swarm.
  const swarm = useSwarmStatus().data;
  const inSwarm = swarm?.active === true;
  const canOverlay = inSwarm && swarm.isManager && !swarm.locked;
  const asOverlay = overlay && canOverlay;
  const overlayOptions = asOverlay ? { encrypted, attachable } : undefined;

  const create = useApiMutation(
    () =>
      api.createNetwork({
        name,
        internal,
        ...(subnet ? { subnet } : {}),
        ...(asOverlay ? { driver: "overlay" as const, encrypted, attachable } : {}),
      }),
    [keys.networks],
    () => t("toast.networkCreated", { name }),
  );

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate(undefined, { onSuccess: onClose });
      }}
    >
      {inSwarm && (
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">{t("topology.networkKind")}</legend>
          <label
            className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${!overlay ? "border-accent" : "border-line"}`}
          >
            <input type="radio" name="kind" checked={!overlay} onChange={() => setOverlay(false)} />
            <span>
              {t("topology.kindLocal")}
              <span className="block text-xs text-dim">{t("topology.kindLocalHint")}</span>
            </span>
          </label>
          <label
            className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${asOverlay ? "border-accent" : "border-line"} ${canOverlay ? "" : "opacity-60"}`}
          >
            <input
              type="radio"
              name="kind"
              checked={asOverlay}
              disabled={!canOverlay}
              onChange={() => setOverlay(true)}
            />
            <span>
              {t("topology.kindOverlay")}
              <span className="block text-xs text-dim">{t("topology.kindOverlayHint")}</span>
              {!canOverlay && (
                <span className="mt-1 block text-xs text-amber">
                  {swarm?.locked ? t("errors.overlayLocked") : t("errors.overlayNeedsManager")}{" "}
                  <Link to="/swarm" className="underline" onClick={onClose}>
                    {t("topology.goToSwarm")}
                  </Link>
                </span>
              )}
            </span>
          </label>
        </fieldset>
      )}
      <Field label={t("topology.networkName")}>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          pattern="[a-zA-Z0-9][a-zA-Z0-9_.\-]*"
          autoFocus
        />
      </Field>
      <Field label={t("topology.subnet")}>
        <Input
          value={subnet}
          onChange={(e) => setSubnet(e.target.value)}
          placeholder="172.40.0.0/24"
          pattern="\d{1,3}(\.\d{1,3}){3}/\d{1,2}"
        />
      </Field>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={internal}
          onChange={(e) => setInternal(e.target.checked)}
        />
        <span>
          {t("topology.internal")}
          <span className="block text-xs text-dim">{t("topology.internalHint")}</span>
        </span>
      </label>
      {asOverlay && (
        <div className="flex flex-col gap-2">
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={encrypted}
              onChange={(e) => setEncrypted(e.target.checked)}
            />
            <span>
              {t("topology.overlayEncrypted")}
              <span className="block text-xs text-dim">{t("topology.overlayEncryptedHint")}</span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={attachable}
              onChange={(e) => setAttachable(e.target.checked)}
            />
            <span>
              {t("topology.overlayAttachable")}
              <span className="block text-xs text-dim">{t("topology.overlayAttachableHint")}</span>
            </span>
          </label>
        </div>
      )}
      <ShowCommand
        command={cli.createNetwork(name || "<name>", internal, subnet || undefined, overlayOptions)}
      />
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>{t("common.cancel")}</Button>
        <Button variant="primary" type="submit" disabled={create.isPending}>
          {t("common.create")}
        </Button>
      </div>
    </form>
  );
}
