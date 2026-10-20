import { describe, expect, it } from "vitest";
import { canRedo, canUndo, commit, initialHistory, redo, undo } from "./history.js";

describe("history", () => {
  it("undoes and redoes", () => {
    let h = initialHistory("a");
    h = commit(h, "b", 1000);
    h = commit(h, "c", 2000);
    expect(h.present).toBe("c");
    h = undo(h);
    expect(h.present).toBe("b");
    h = undo(h);
    expect(h.present).toBe("a");
    expect(canUndo(h)).toBe(false);
    h = redo(h);
    expect(h.present).toBe("b");
    expect(canRedo(h)).toBe(true);
  });

  it("a new edit clears the redo stack", () => {
    let h = commit(commit(initialHistory("a"), "b", 1000), "c", 2000);
    h = undo(h);
    h = commit(h, "d", 3000);
    expect(canRedo(h)).toBe(false);
    expect(undo(h).present).toBe("b");
  });

  it("coalesces rapid typing into one step", () => {
    let h = initialHistory("a");
    h = commit(h, "ab", 1000, 500);
    h = commit(h, "abc", 1200, 500);
    h = commit(h, "abcd", 1400, 500);
    expect(h.past).toEqual(["a"]);
    h = commit(h, "abcde", 5000, 500);
    expect(h.past).toEqual(["a", "abcd"]);
  });

  it("ignores identical text and caps its size", () => {
    const h = initialHistory("a");
    expect(commit(h, "a", 1)).toBe(h);
    let big = h;
    for (let i = 0; i < 300; i++) big = commit(big, `v${i}`, i);
    expect(big.past.length).toBe(200);
  });
});
