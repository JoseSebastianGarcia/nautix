import { Handle, Position } from "@xyflow/react";
import { type CSSProperties, Fragment } from "react";
import { SIDES, type Side } from "./edge-sides.js";

const POSITION: Record<Side, Position> = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
};

const HIDDEN: CSSProperties = { opacity: 0, pointerEvents: "none" };

/**
 * A handle on each of the four sides, so a line can leave and arrive by the sides that face the other box
 * (`<prefix>-top`, `-right`, `-bottom`, `-left`). The visible one is where a drag starts (the dots only show while
 * the node is hovered or selected, see `.nx-handle`); a hidden twin of the other type sits under it so a line can
 * also end there.
 */
export function SideHandles({
  prefix,
  connectable,
  visibleStyle,
  label,
  title,
}: {
  prefix: string;
  /** The dots can be dragged; when false every handle is invisible and only anchors lines. */
  connectable: boolean;
  visibleStyle: CSSProperties;
  label?: string;
  title?: string;
}) {
  return (
    <>
      {SIDES.map((side) => (
        <Fragment key={side}>
          <Handle
            id={`${prefix}-${side}`}
            type="source"
            className="nx-handle"
            position={POSITION[side]}
            isConnectable={connectable}
            style={connectable ? visibleStyle : HIDDEN}
            {...(label ? { "aria-label": label } : {})}
            {...(title ? { title } : {})}
          />
          <Handle
            id={`${prefix}-${side}`}
            type="target"
            position={POSITION[side]}
            isConnectable={false}
            style={HIDDEN}
          />
        </Fragment>
      ))}
    </>
  );
}
