import { useQuery } from "@tanstack/react-query";
import { Lock, Network, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../app/api.js";
import { Button } from "../../components/ui.js";
import { ExposureDialog, type ExposureTarget } from "../containers/exposure-dialog.js";
import { Table, Td } from "../resources/table.js";

const ICON = { open: ShieldAlert, address: Network, local: Lock } as const;
const COLOR = { open: "text-amber", address: "text-accent", local: "text-cyan" } as const;

/** Every published port and who can reach it, open ones first so none is hidden. */
export function ExposureTab() {
  const { t } = useTranslation();
  const rows = useQuery({ queryKey: ["exposure"], queryFn: api.exposure, refetchInterval: 15_000 });
  const [target, setTarget] = useState<ExposureTarget | null>(null);
  const list = rows.data ?? [];
  const open = list.filter((r) => r.exposure.kind === "open").length;

  return (
    <section className="flex flex-col gap-4">
      <p className="text-xs text-dim">{t("exposure.intro")}</p>
      {open > 0 && (
        <p role="status" className="text-sm text-amber">
          {t("exposure.openCount", { count: open })}
        </p>
      )}
      <Table
        head={[t("exposure.container"), t("exposure.port"), t("exposure.who"), t("common.actions")]}
        empty={list.length === 0}
      >
        {list.map((r) => {
          const Icon = ICON[r.exposure.kind];
          return (
            <tr key={`${r.containerId}:${r.hostIp}:${r.hostPort}:${r.protocol}`}>
              <Td mono>{r.container}</Td>
              <Td mono>
                {r.hostIp || "0.0.0.0"}:{r.hostPort} → {r.containerPort}/{r.protocol}
              </Td>
              <Td>
                <span className={`inline-flex items-center gap-1 ${COLOR[r.exposure.kind]}`}>
                  <Icon size={14} />{" "}
                  {r.exposure.kind === "address"
                    ? r.exposure.address
                    : t(`exposure.kind.${r.exposure.kind}`)}
                </span>
              </Td>
              <Td>
                <Button
                  write
                  disabled={r.isSelf}
                  title={r.isSelf ? t("self.lockedNote") : undefined}
                  onClick={() => setTarget(r)}
                >
                  {t("exposure.change")}
                </Button>
              </Td>
            </tr>
          );
        })}
      </Table>
      <ExposureDialog target={target} onClose={() => setTarget(null)} />
    </section>
  );
}
