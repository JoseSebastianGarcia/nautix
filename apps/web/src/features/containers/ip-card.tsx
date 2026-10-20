import { type Container, checkFixedIp } from "@nautix/contracts";
import { Copy, Pin } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { api } from "../../app/api.js";
import { keys, useContainers, useIsAdmin, useNetworks } from "../../app/queries.js";
import { useApiMutation } from "../../app/use-api-mutation.js";
import { useToasts } from "../../components/toast-store.js";
import { Button, Dialog, Field, Input } from "../../components/ui.js";
import { Card } from "./panels.js";

const REFRESH = [keys.containers, keys.networks];

/** The container's address on each network, to copy and use when pointing a domain at it. */
export function IpCard({ container }: { container: Container }) {
  const { t } = useTranslation();
  const push = useToasts((s) => s.push);
  const isAdmin = useIsAdmin();
  const { data: networks = [] } = useNetworks();
  const { data: containers = [] } = useContainers();
  const [pinning, setPinning] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const entries = Object.entries(container.ips ?? {});
  const canPin = isAdmin && !container.isSelf && container.state === "running";
  const network = networks.find((n) => n.name === pinning);
  const taken = containers.flatMap((c) => {
    const used = c.id !== container.id ? c.ips?.[pinning ?? ""] : undefined;
    return used ? [used] : [];
  });
  const problem =
    pinning && value.trim() ? checkFixedIp(value.trim(), network?.subnet ?? null, taken) : null;
  const pin = useApiMutation(
    (ip: string | null) => api.setFixedIp(container.id, pinning ?? "", ip),
    REFRESH,
    () => t("details.fixIpDone"),
  );
  const close = () => {
    setPinning(null);
    setValue("");
  };

  return (
    <Card title={t("details.ips")}>
      {entries.length === 0 ? (
        <p className="text-sm text-dim">
          {container.state === "running" ? t("details.noIps") : t("details.ipsStopped")}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.map(([net, ip]) => (
            <li key={net} className="flex items-center gap-3 text-sm">
              <span className="w-32 shrink-0 truncate text-dim">{net}</span>
              <code className="font-mono">{ip}</code>
              <button
                type="button"
                aria-label={`${t("common.copy")} ${ip}`}
                title={t("common.copy")}
                className="text-dim hover:text-accent"
                onClick={() => {
                  void navigator.clipboard?.writeText(ip);
                  push("ok", t("common.copied"));
                }}
              >
                <Copy size={14} />
              </button>
              {canPin && networks.some((n) => n.name === net && !n.system) && (
                <button
                  type="button"
                  aria-label={`${t("details.fixIp")} ${net}`}
                  title={t("details.fixIp")}
                  className="text-dim hover:text-accent"
                  onClick={() => {
                    setPinning(net);
                    setValue(ip);
                  }}
                >
                  <Pin size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-dim">
        {t("details.ipsHint")}{" "}
        <Link to="/dns" className="text-accent hover:underline">
          {t("details.ipsGoDns")}
        </Link>
      </p>
      <Dialog
        open={pinning !== null}
        onClose={close}
        title={t("details.fixIpTitle", { network: pinning ?? "" })}
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (value.trim() && problem === null) pin.mutate(value.trim(), { onSuccess: close });
          }}
        >
          <p className="text-sm text-dim">{t("details.fixIpBody")}</p>
          <Field
            label={t("details.fixIpLabel")}
            hint={t("topology.fixedIpHint", { subnet: network?.subnet ?? "?" })}
          >
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              aria-invalid={problem !== null}
              autoFocus
            />
            {problem && <p className="text-xs text-danger">{t(`errors.fixedIp_${problem}`)}</p>}
          </Field>
          <p className="text-xs text-amber">{t("details.fixIpWarning")}</p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button onClick={close}>{t("common.cancel")}</Button>
            <Button disabled={pin.isPending} onClick={() => pin.mutate(null, { onSuccess: close })}>
              {t("details.fixIpAuto")}
            </Button>
            <Button
              variant="primary"
              type="submit"
              disabled={!value.trim() || problem !== null || pin.isPending}
            >
              {t("details.fixIpSet")}
            </Button>
          </div>
        </form>
      </Dialog>
    </Card>
  );
}
