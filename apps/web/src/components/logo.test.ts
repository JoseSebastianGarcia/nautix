import { describe, expect, it } from "vitest";
import { emblemBox } from "./logo.js";

describe("emblemBox", () => {
  it("centres the emblem in a square of the given size", () => {
    const { width, left, top } = emblemBox(32);
    // the emblem centre (53.5%, 40.5% of the image) must land at the middle of the square
    expect(left + 0.535 * width).toBeCloseTo(16, 5);
    expect(top + 0.405 * width).toBeCloseTo(16, 5);
    // and the emblem's diameter must fill the square
    expect(0.57 * width).toBeCloseTo(32, 5);
  });
});
