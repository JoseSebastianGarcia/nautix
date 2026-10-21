import { useTranslation } from "react-i18next";
import type { AuditRow } from "../../app/api.js";
import { Table, Td } from "../resources/table.js";

/** The audit trail as a table; shared by Settings and the history tab of a container. */
export function AuditTable({ rows }: { rows: AuditRow[] }) {
  const { t } = useTranslation();
  return (
    <Table
      head={[
        t("settings.auditTime"),
        t("settings.auditActor"),
        t("settings.auditAction"),
        t("settings.auditStatus"),
      ]}
      empty={rows.length === 0}
    >
      {rows.map((r) => (
        <tr key={r.id}>
          <Td mono>{new Date(r.at).toLocaleString()}</Td>
          <Td mono>
            {r.actor} <span className="text-dim">({r.kind})</span>
          </Td>
          <Td mono>
            {r.action}
            {r.detail && <span className="block break-all text-dim">{r.detail}</span>}
          </Td>
          <Td mono>{r.status || "—"}</Td>
        </tr>
      ))}
    </Table>
  );
}
