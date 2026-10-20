import { logoFor } from "./logos.js";

export function LogoBadge({
  image,
  name,
  size = 40,
}: {
  image: string;
  name?: string;
  size?: number;
}) {
  const logo = logoFor(image, name);
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-lg"
      style={{ width: size, height: size, background: `${logo.hex}26`, color: logo.hex }}
    >
      {logo.path ? (
        <svg
          role="presentation"
          viewBox="0 0 24 24"
          width={size * 0.55}
          height={size * 0.55}
          fill="currentColor"
        >
          <path d={logo.path} />
        </svg>
      ) : (
        <span className="font-mono text-xs font-bold">{logo.initials}</span>
      )}
    </span>
  );
}
