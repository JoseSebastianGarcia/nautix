export type Side = "top" | "right" | "bottom" | "left";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const SIDES: readonly Side[] = ["top", "right", "bottom", "left"];

const PAIRS: Record<
  "horizontal" | "vertical",
  (forward: boolean) => { source: Side; target: Side }
> = {
  horizontal: (forward) =>
    forward ? { source: "right", target: "left" } : { source: "left", target: "right" },
  vertical: (forward) =>
    forward ? { source: "bottom", target: "top" } : { source: "top", target: "bottom" },
};

const anchor = (r: Rect, side: Side): { x: number; y: number } => ({
  x: side === "left" ? r.x : side === "right" ? r.x + r.w : r.x + r.w / 2,
  y: side === "top" ? r.y : side === "bottom" ? r.y + r.h : r.y + r.h / 2,
});

/** True when the straight line between the two anchors goes through a box (the ends' own boxes excluded). */
const crosses = (
  a: { x: number; y: number },
  b: { x: number; y: number },
  boxes: Rect[],
): boolean =>
  boxes.some((r) => {
    for (let i = 1; i < 24; i++) {
      const x = a.x + ((b.x - a.x) * i) / 24;
      const y = a.y + ((b.y - a.y) * i) / 24;
      if (x > r.x + 2 && x < r.x + r.w - 2 && y > r.y + 2 && y < r.y + r.h - 2) return true;
    }
    return false;
  });

/**
 * Which side of each box a line between them should use: the ones that face each other. When the boxes are
 * further apart sideways than up and down the line leaves by the side that looks at the other box (and arrives
 * on the opposite one); otherwise it goes out the top or the bottom. Distances are measured in box sizes so a
 * wide box next to a narrow one still reads naturally. When `others` (the rest of the boxes on the canvas) are
 * given and the natural choice would run through one of them, the other axis is used if that one is clear.
 */
export const sidesBetween = (
  from: Rect,
  to: Rect,
  others: Rect[] = [],
): { source: Side; target: Side } => {
  const dx = to.x + to.w / 2 - (from.x + from.w / 2);
  const dy = to.y + to.h / 2 - (from.y + from.h / 2);
  const horizontal = Math.abs(dx) / ((from.w + to.w) / 2) >= Math.abs(dy) / ((from.h + to.h) / 2);
  const natural = horizontal ? PAIRS.horizontal(dx >= 0) : PAIRS.vertical(dy >= 0);
  if (others.length === 0) return natural;
  const clear = (pair: { source: Side; target: Side }): boolean =>
    !crosses(anchor(from, pair.source), anchor(to, pair.target), others);
  if (clear(natural)) return natural;
  const other = horizontal ? PAIRS.vertical(dy >= 0) : PAIRS.horizontal(dx >= 0);
  return clear(other) ? other : natural;
};
