import { ThemedLogo } from "./themed-logo.js";

/** Faint monochrome brand mark at the foot of a canvas; the full logo reads better than the round emblem on the grid. */
export function CanvasWatermark() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute bottom-0 left-1/2 z-0 -translate-x-1/2 opacity-30 grayscale"
    >
      <ThemedLogo size={200} alt="" />
    </div>
  );
}
