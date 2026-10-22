import { useState } from "react";

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
  return (
    <img
      src={`/brand/emblem-${theme}.png`}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      style={{ width: size, height: size, maxWidth: "none" }}
      onError={() => setMissing(true)}
    />
  );
}

/** Header brand: the emblem of the brand image for the current theme (vector fallback); the name is only for screen readers. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2 font-semibold tracking-tight">
      <span className="nx-logo-light">
        <Emblem size={size} theme="light" />
      </span>
      <span className="nx-logo-dark">
        <Emblem size={size} theme="dark" />
      </span>
      <span className="sr-only">Nautix</span>
    </span>
  );
}
