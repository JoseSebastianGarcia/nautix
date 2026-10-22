import { ChevronLeft, ChevronRight } from "lucide-react";

/** Small tab on the edge of the canvas that shows or hides the palette (left) or the inspector (right). */
export function PanelTab({
  side,
  open,
  label,
  onClick,
}: {
  side: "left" | "right";
  open: boolean;
  label: string;
  onClick: () => void;
}) {
  // An arrow points where the panel goes: away from the canvas to hide it, towards its edge to show it.
  const Arrow = (side === "left") === open ? ChevronLeft : ChevronRight;
  const place = side === "left" ? "left-2" : open ? "right-[21.25rem]" : "right-3";
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-expanded={open}
      onClick={onClick}
      className={`nx-glass absolute top-1/2 z-10 flex h-10 w-6 -translate-y-1/2 items-center justify-center rounded-full text-dim hover:text-fg ${place}`}
    >
      <Arrow size={16} />
    </button>
  );
}
