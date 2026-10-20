/** Minimal ustar writer for the browser: regular files only, long paths split into prefix + name. */

const BLOCK = 512;
const encoder = new TextEncoder();

export interface TarEntry {
  path: string;
  /** A `File` works too, so big folders are never copied into memory. */
  data: Blob;
}

const octal = (value: number, width: number): string => value.toString(8).padStart(width - 1, "0");

const put = (header: Uint8Array, offset: number, width: number, text: string): void => {
  header.set(encoder.encode(text).subarray(0, width), offset);
};

/** Splits a path longer than 100 bytes at a "/" so name ≤ 100 and prefix ≤ 155; null if impossible. */
const splitPath = (path: string): { name: string; prefix: string } | null => {
  if (encoder.encode(path).length <= 100) return { name: path, prefix: "" };
  for (let i = path.indexOf("/"); i >= 0; i = path.indexOf("/", i + 1)) {
    const prefix = path.slice(0, i);
    const name = path.slice(i + 1);
    if (encoder.encode(prefix).length <= 155 && encoder.encode(name).length <= 100)
      return { name, prefix };
  }
  return null;
};

export const buildTar = (entries: TarEntry[]): Blob => {
  const parts: BlobPart[] = [];
  const mtime = Math.floor(Date.now() / 1000);
  for (const entry of entries) {
    const split = splitPath(entry.path);
    if (!split) throw new Error(`path too long: ${entry.path}`);
    const header = new Uint8Array(BLOCK);
    put(header, 0, 100, split.name);
    put(header, 100, 8, `${octal(0o644, 8)}\0`);
    put(header, 108, 8, `${octal(0, 8)}\0`);
    put(header, 116, 8, `${octal(0, 8)}\0`);
    put(header, 124, 12, `${octal(entry.data.size, 12)}\0`);
    put(header, 136, 12, `${octal(mtime, 12)}\0`);
    header.fill(0x20, 148, 156);
    header[156] = 0x30; // regular file
    put(header, 257, 6, "ustar\0");
    put(header, 263, 2, "00");
    put(header, 345, 155, split.prefix);
    let sum = 0;
    for (const byte of header) sum += byte;
    put(header, 148, 8, `${octal(sum, 7)}\0`);
    parts.push(header, entry.data, new Uint8Array((BLOCK - (entry.data.size % BLOCK)) % BLOCK));
  }
  parts.push(new Uint8Array(BLOCK * 2));
  return new Blob(parts, { type: "application/x-tar" });
};
