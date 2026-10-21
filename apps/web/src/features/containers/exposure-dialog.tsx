import { bindAddressOf, type Exposure, exposureOf, isIpAddress } from "@nautix/contracts";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../app/api.js";
import { keys } from "../../app/queries.js";
import { useApiMutation } from "../../app/use-api-mutation.js";
import { ApplyFailure } from "../../components/apply-failure.js";
import { Button, Dialog, Field, Input } from "../../components/ui.js";

export interface ExposureTarget {
  containerId: string;
  container: string;
  containerPort: number;
  hostPort: number;
  protocol: string;
  /** Host IP the port is bound to now. */
  hostIp: string;
}

const KINDS = ["local", "address", "open"] as const;

/** Changes who can reach one published port. Docker cannot rebind a live port, so this recreates the container. */
export function ExposureDialog({
  target,
  onClose,
}: {
  target: ExposureTarget | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog
      open={target !== null}
      onClose={onClose}
      title={t("exposure.title", { port: target?.hostPort ?? "" })}
      help="guards"
    >
      {/* The dialog only renders its children while open, so the form starts fresh each time. */}
      {target && <ExposureForm target={target} onClose={onClose} />}
    </Dialog>
  );
}

function ExposureForm({ target, onClose }: { target: ExposureTarget; onClose: () => void }) {
  const { t } = useTranslation();
  const current = exposureOf(target.hostIp);
  const [kind, setKind] = useState<Exposure["kind"]>(current.kind);
  const [address, setAddress] = useState(current.kind === "address" ? current.address : "");

  const save = useApiMutation(
    (exposure: Exposure) =>
      api.setExposure(target.containerId, [
        {
          containerPort: target.containerPort,
          protocol: target.protocol === "udp" ? "udp" : "tcp",
          exposure,
        },
      ]),
    [keys.containers, ["exposure"]],
    () => t("exposure.done"),
  );

  const valid = kind !== "address" || isIpAddress(address.trim());
  const next: Exposure =
    kind === "address" ? { kind, address: address.trim() } : ({ kind } as Exposure);
  const unchanged = valid && bindAddressOf(next) === bindAddressOf(current);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid || unchanged) return;
        save.mutate(next, { onSuccess: onClose });
      }}
    >
      <p className="font-mono text-xs text-dim">
        {target.container} · {target.hostIp || "0.0.0.0"}:{target.hostPort} → {target.containerPort}
        /{target.protocol}
      </p>
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">{t("exposure.who")}</legend>
        {KINDS.map((k) => (
          <label key={k} className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="exposure"
              checked={kind === k}
              onChange={() => setKind(k)}
              className="mt-1"
            />
            <span>
              {t(`exposure.kind.${k}`)}
              <span className="block text-xs text-dim">{t(`exposure.help.${k}`)}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {kind === "address" && (
        <Field label={t("exposure.address")} hint={t("exposure.addressHint")}>
          <Input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="192.168.1.20"
            aria-invalid={address !== "" && !valid}
          />
        </Field>
      )}
      {kind === "open" && <p className="text-xs text-amber">{t("topology.exposeWarning")}</p>}
      <p className="text-xs text-dim">{t("exposure.recreate")}</p>
      <ApplyFailure error={save.error} />
      <div className="flex justify-end gap-2">
        <Button type="button" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button
          write
          variant="primary"
          type="submit"
          disabled={!valid || unchanged || save.isPending}
        >
          {t("exposure.apply")}
        </Button>
      </div>
    </form>
  );
}
