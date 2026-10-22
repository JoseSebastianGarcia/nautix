import { useCallback, useEffect, useState } from "react";

/**
 * Palette and inspector of a canvas: a click on empty canvas tucks both away so only the drawing is
 * left, selecting something brings the inspector back, and a tab on each edge toggles them by hand.
 */
export function useCanvasPanels(hasSelection: boolean) {
  const [paletteOpen, setPaletteOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  useEffect(() => {
    if (hasSelection) setInspectorOpen(true);
  }, [hasSelection]);
  const hideAll = useCallback(() => {
    setPaletteOpen(false);
    setInspectorOpen(false);
  }, []);
  return { paletteOpen, setPaletteOpen, inspectorOpen, setInspectorOpen, hideAll };
}
