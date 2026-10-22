import { useState } from "react";
import { Logo } from "./logo.js";

/** Full brand logo (transparent background) for the current theme. If a file is missing, the vector mark is shown. */
export function ThemedLogo({ size = 200, alt }: { size?: number; alt: string }) {
  const [missing, setMissing] = useState({ light: false, dark: false });
  const style = { width: size, height: size };
  return (
    <>
      <span className="nx-logo-light" style={style}>
        {missing.light ? (
          <Logo size={size / 4} />
        ) : (
          <img
            src="/brand/logo-light.png"
            alt={alt}
            style={style}
            onError={() => setMissing((m) => ({ ...m, light: true }))}
          />
        )}
      </span>
      <span className="nx-logo-dark" style={style}>
        {missing.dark ? (
          <Logo size={size / 4} />
        ) : (
          <img
            src="/brand/logo-dark.png"
            alt={alt}
            style={style}
            onError={() => setMissing((m) => ({ ...m, dark: true }))}
          />
        )}
      </span>
    </>
  );
}
