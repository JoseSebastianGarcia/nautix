import { useState } from "react";
import { selectAll, toggled } from "./bulk.js";

/**
 * Checkbox selection for a list. Only rows `canSelect` accepts can be ticked (Nautix's own container and
 * system networks cannot); rows that disappeared from the list drop out of the selection by themselves.
 */
export function useListSelection<T>(
  rows: readonly T[],
  keyOf: (row: T) => string,
  canSelect: (row: T) => boolean = () => true,
) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const selectable = rows.filter(canSelect);
  const keysOf = selectable.map(keyOf);
  const chosen = selectable.filter((r) => selected.has(keyOf(r)));
  return {
    /** The ticked rows that are still in the list. */
    rows: chosen,
    has: (key: string) => selected.has(key),
    toggle: (key: string) => setSelected(toggled(selected, key)),
    clear: () => setSelected(new Set()),
    /** Props for the header checkbox of `Table`. */
    table: (label: string) => ({
      checked: keysOf.length > 0 && chosen.length === keysOf.length,
      partial: chosen.length > 0 && chosen.length < keysOf.length,
      onToggleAll: () => setSelected(selectAll(keysOf, selected)),
      label,
    }),
  };
}
