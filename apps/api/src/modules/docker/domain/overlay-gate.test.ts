import { describe, expect, it } from "vitest";
import { overlayBlocker } from "./overlay-gate.js";

describe("overlayBlocker", () => {
  it("lets only a manager create overlay networks", () => {
    expect(overlayBlocker("manager")).toBeNull();
    expect(overlayBlocker("none")).toBe("errors.overlayNeedsSwarm");
    expect(overlayBlocker("worker")).toBe("errors.overlayNeedsManager");
    expect(overlayBlocker("locked")).toBe("errors.overlayLocked");
  });
});
