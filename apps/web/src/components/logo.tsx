import { useState } from "react";

/**
 * Where the circular emblem sits inside the square brand images (fractions of the image width),
 * so the header can show just the emblem, cropped, without a second asset.
 */
const EMBLEM = { centerX: 0.535, centerY: 0.405, diameter: 0.57 };

export const emblemBox = (size: number): { width: number; left: number; top: number } => {
  const width = size / EMBLEM.diameter;
  return { width, left: size / 2 - EMBLEM.centerX * width, top: size / 2 - EMBLEM.centerY * width };
};

function VectorMark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path
        d="M16 5 26 11v10l-10 6L6 21V11z"
        fill="none"
        stroke="var(--nx-accent)"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="16" r="3.2" fill="var(--nx-accent)" />
    </svg>
  );
}

function Emblem({ size, theme }: { size: number; theme: "light" | "dark" }) {
  const [missing, setMissing] = useState(false);
  if (missing) return <VectorMark size={size} />;
  const box = emblemBox(size);
  return (
    <span
      className="relative inline-block overflow-hidden rounded-full"
      style={{ width: size, height: size }}
    >
      <img
        src={`/brand/logo-${theme}.png`}
        alt=""
        aria-hidden="true"
        onError={() => setMissing(true)}
        style={{
          position: "absolute",
          maxWidth: "none",
          width: box.width,
          left: box.left,
          top: box.top,
          mixBlendMode: theme === "light" ? "multiply" : "lighten",
        }}
      />
    </span>
  );
}

/** Header brand: the emblem of the brand image for the current theme (vector fallback) + name. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2 font-semibold tracking-tight">
      <span className="nx-logo-light">
        <Emblem size={size} theme="light" />
      </span>
      <span className="nx-logo-dark">
        <Emblem size={size} theme="dark" />
      </span>
      Nautix
    </span>
  );
}
