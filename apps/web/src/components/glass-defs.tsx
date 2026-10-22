/**
 * SVG filters behind the liquid-glass layers: a displacement map that bends what is behind the
 * edge of the glass, like a thick lens. Used through `backdrop-filter: url(#...)` (see theme.css).
 */
const map = (edgeX: number, edgeY: number): string => {
  const stops = (c: (v: number) => string, e: number) =>
    `<stop offset="0" stop-color="${c(0)}"/><stop offset="${e}" stop-color="${c(128)}"/><stop offset="${1 - e}" stop-color="${c(128)}"/><stop offset="1" stop-color="${c(255)}"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" preserveAspectRatio="none"><defs><linearGradient id="x" x1="0" x2="1" y1="0" y2="0">${stops((v) => `rgb(${v},0,0)`, edgeX)}</linearGradient><linearGradient id="y" x1="0" x2="0" y1="0" y2="1">${stops((v) => `rgb(0,${v},0)`, edgeY)}</linearGradient></defs><rect width="100%" height="100%" fill="rgb(0,0,128)"/><rect width="100%" height="100%" fill="url(#x)" style="mix-blend-mode:screen"/><rect width="100%" height="100%" fill="url(#y)" style="mix-blend-mode:screen"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

function Lens({ id, href, scale }: { id: string; href: string; scale: number }) {
  return (
    <filter id={id} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
      <feImage
        href={href}
        x="0"
        y="0"
        width="100%"
        height="100%"
        preserveAspectRatio="none"
        result="map"
      />
      <feDisplacementMap
        in="SourceGraphic"
        in2="map"
        scale={scale}
        xChannelSelector="R"
        yChannelSelector="G"
      />
    </filter>
  );
}

export function GlassDefs() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden="true" focusable="false">
      <title>glass</title>
      <Lens id="nx-lens-wide" href={map(0.02, 0.3)} scale={50} />
      <Lens id="nx-lens-tall" href={map(0.1, 0.03)} scale={45} />
    </svg>
  );
}
