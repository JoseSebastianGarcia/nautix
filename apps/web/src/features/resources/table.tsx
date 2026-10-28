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

/** Header checkbox of a selectable list: ticks or clears every row that can be selected. */
export interface TableSelection {
  /** True when every selectable row is ticked. */
  checked: boolean;
  /** Some, but not all. */
  partial: boolean;
  onToggleAll: () => void;
  /** Accessible name, e.g. "Select all containers". */
  label: string;
}

export function Table({
  head,
  children,
  empty,
  selection,
}: {
  head: string[];
  children: ReactNode[];
  empty: boolean;
  selection?: TableSelection;
}) {
  const { t } = useTranslation();
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-bg1">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-line text-xs uppercase tracking-wider text-dim">
          <tr>
            {selection && (
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  aria-label={selection.label}
                  checked={selection.checked}
                  ref={(el) => {
                    if (el) el.indeterminate = selection.partial;
                  }}
                  onChange={selection.onToggleAll}
                />
              </th>
            )}
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

/** The checkbox cell of one row of a selectable list. */
export const RowCheck = ({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  disabled?: boolean;
}) => (
  <td className="w-10 px-4 py-3 align-middle">
    <input
      type="checkbox"
      aria-label={label}
      checked={checked}
      disabled={disabled}
      onChange={onChange}
    />
  </td>
);
