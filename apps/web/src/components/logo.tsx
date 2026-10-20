export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2 font-semibold tracking-tight">
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
      Nautix
    </span>
  );
}
