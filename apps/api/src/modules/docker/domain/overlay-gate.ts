import type { SwarmRole } from "@nautix/contracts";

/** Why an overlay network cannot be created from this engine, as the error hint to show; null when it can. */
export const overlayBlocker = (role: SwarmRole): string | null => {
  switch (role) {
    case "manager":
      return null;
    case "worker":
      return "errors.overlayNeedsManager";
    case "locked":
      return "errors.overlayLocked";
    default:
      return "errors.overlayNeedsSwarm";
  }
};
