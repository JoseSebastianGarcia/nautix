import { useTranslation } from "react-i18next";
import { useCluster, useNetworks } from "../../app/queries.js";
import { Button, Dialog } from "../../components/ui.js";
import { leaveImpact } from "./leave-impact.js";

/** Says what leaving the swarm takes with it before asking: zones without a cluster, services, and whether this is the last manager. */
export function LeaveSwarmDialog({
  open,
  onConfirm,
  onClose,
}: {
  open: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const cluster = useCluster(open);
  const { data: networks = [] } = useNetworks();
  const impact = cluster.data ? leaveImpact(cluster.data, networks) : null;
  const list = (names: string[]): string =>
    names.length > 6 ? `${names.slice(0, 6).join(", ")}…` : names.join(", ");

  return (
    <Dialog open={open} onClose={onClose} title={t("swarm.leaveTitle")}>
      <p className="text-sm text-dim">{t("swarm.leaveBody")}</p>
      {impact?.known && impact.zones.length > 0 && (
        <p className="rounded-lg border border-danger p-3 text-sm text-danger">
          {t("swarm.leaveZones", { count: impact.zones.length, names: list(impact.zones) })}
        </p>
      )}
      {impact?.known && impact.services.length > 0 && (
        <p className="rounded-lg border border-line p-3 text-sm">
          {t("swarm.leaveServices", {
            count: impact.services.length,
            names: list(impact.services),
          })}
        </p>
      )}
      <p className="rounded-lg border border-line p-3 text-sm text-dim">
        {t("swarm.leaveDataSafe")}
      </p>
      {impact?.lastManager && (
        <p className="rounded-lg border border-amber p-3 text-sm text-amber">
          {t("swarm.leaveLastManager")}
        </p>
      )}
      {impact && !impact.known && <p className="text-xs text-dim">{t("swarm.leaveUnknown")}</p>}
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>{t("common.cancel")}</Button>
        <Button
          variant="danger"
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          {t("swarm.leave")}
        </Button>
      </div>
    </Dialog>
  );
}
