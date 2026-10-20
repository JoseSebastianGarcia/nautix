import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

export function PageHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <h1 className="text-xl font-semibold">{title}</h1>
      <div className="flex gap-2">{actions}</div>
    </div>
  );
}

export function Table({
  head,
  children,
  empty,
}: {
  head: string[];
  children: ReactNode[];
  empty: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-bg1">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-line text-xs uppercase tracking-wider text-dim">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-4 py-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
      {empty && <p className="p-6 text-center text-dim">{t("common.empty")}</p>}
    </div>
  );
}

export const Td = ({ children, mono = false }: { children: ReactNode; mono?: boolean }) => (
  <td className={`px-4 py-3 align-middle ${mono ? "font-mono text-xs" : ""}`}>{children}</td>
);
