import type { Container } from "@nautix/contracts";
import { Copy } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useToasts } from "../../components/toast-store.js";
import { Card } from "./panels.js";

/** The container's address on each network, to copy and use when pointing a domain at it. */
export function IpCard({ container }: { container: Container }) {
  const { t } = useTranslation();
  const push = useToasts((s) => s.push);
  const entries = Object.entries(container.ips ?? {});
  return (
    <Card title={t("details.ips")}>
      {entries.length === 0 ? (
        <p className="text-sm text-dim">
          {container.state === "running" ? t("details.noIps") : t("details.ipsStopped")}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.map(([network, ip]) => (
            <li key={network} className="flex items-center gap-3 text-sm">
              <span className="w-32 shrink-0 truncate text-dim">{network}</span>
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
    </Card>
  );
}
