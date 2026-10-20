/** SVG polyline points for a series scaled to a w×h box (values ≥ 0). */
export const sparklinePoints = (values: number[], w: number, h: number, max?: number): string => {
  if (values.length === 0) return "";
  const top = max ?? Math.max(...values, 1);
  const step = values.length > 1 ? w / (values.length - 1) : 0;
  return values
    .map((v, i) => `${(i * step).toFixed(1)},${(h - (Math.min(v, top) / top) * h).toFixed(1)}`)
    .join(" ");
};

/** Keeps the last `n` samples. */
export const pushSample = (series: number[], value: number, n = 40): number[] =>
  [...series, value].slice(-n);

/** Case-insensitive line filter for the log viewer; an empty query keeps everything. */
export const filterLines = (text: string, query: string): string[] => {
  const lines = text.split("\n");
  const q = query.trim().toLowerCase();
  return q ? lines.filter((l) => l.toLowerCase().includes(q)) : lines;
};

/** `Config.Env[0]` style path used by the inspect tree's "copy path". */
export const jsonPath = (parts: (string | number)[]): string =>
  parts
    .reduce<string>(
      (acc, p) =>
        typeof p === "number"
          ? `${acc}[${p}]`
          : /^[A-Za-z_][\w]*$/.test(p)
            ? `${acc}.${p}`
            : `${acc}["${p}"]`,
      "",
    )
    .replace(/^\./, "");

export const percent = (part: number, whole: number): number =>
  whole > 0 ? Math.min(100, Math.round((part / whole) * 1000) / 10) : 0;
