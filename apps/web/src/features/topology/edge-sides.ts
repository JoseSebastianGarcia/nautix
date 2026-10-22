export type Side = "top" | "right" | "bottom" | "left";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const SIDES: readonly Side[] = ["top", "right", "bottom", "left"];

/**
 * Which side of each box a line between them should use: the ones that face each other. When the boxes are
 * further apart sideways than up and down the line leaves by the side that looks at the other box (and arrives
 * on the opposite one); otherwise it goes out the top or the bottom. Distances are measured in box sizes so a
 * wide box next to a narrow one still reads naturally.
 */
export const sidesBetween = (from: Rect, to: Rect): { source: Side; target: Side } => {
  const dx = to.x + to.w / 2 - (from.x + from.w / 2);
  const dy = to.y + to.h / 2 - (from.y + from.h / 2);
  const horizontal = Math.abs(dx) / ((from.w + to.w) / 2) >= Math.abs(dy) / ((from.h + to.h) / 2);
  if (horizontal)
    return dx >= 0 ? { source: "right", target: "left" } : { source: "left", target: "right" };
  return dy >= 0 ? { source: "bottom", target: "top" } : { source: "top", target: "bottom" };
};
