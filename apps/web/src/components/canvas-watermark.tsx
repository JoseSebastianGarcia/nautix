import { ThemedLogo } from "./themed-logo.js";

/** Faint brand mark in the corner of a canvas; the full logo reads better than the round emblem on the grid. */
export function CanvasWatermark() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute bottom-3 left-1/2 z-0 -translate-x-1/2 opacity-35"
    >
      <ThemedLogo size={96} alt="" />
    </div>
  );
}
