import { describe, expect, it } from "vitest";
import { type Rect, sidesBetween } from "./edge-sides.js";

const box = (x: number, y: number, w = 200, h = 100): Rect => ({ x, y, w, h });

describe("sidesBetween", () => {
  it("joins the sides that face each other", () => {
    expect(sidesBetween(box(0, 0), box(400, 0))).toEqual({ source: "right", target: "left" });
    expect(sidesBetween(box(400, 0), box(0, 0))).toEqual({ source: "left", target: "right" });
    expect(sidesBetween(box(0, 0), box(0, 300))).toEqual({ source: "bottom", target: "top" });
    expect(sidesBetween(box(0, 300), box(0, 0))).toEqual({ source: "top", target: "bottom" });
  });

  it("a box below and to the left leaves by the top and arrives from below (the case of two networks one under the other)", () => {
    // EXTRA is under INTRA and a little to the right: the line goes up from EXTRA and comes into INTRA from below.
    const intra = box(0, 0, 340, 190);
    const extra = box(190, 240, 340, 190);
    expect(sidesBetween(extra, intra)).toEqual({ source: "top", target: "bottom" });
  });

  it("uses the box sizes, not raw pixels", () => {
    // Far sideways but very wide boxes: still stacked.
    expect(sidesBetween(box(0, 0, 1000, 100), box(300, 200, 1000, 100)).source).toBe("bottom");
  });
});
