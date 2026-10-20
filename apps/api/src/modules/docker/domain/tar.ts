export interface TarFile {
  /** Absolute path inside the container, e.g. /etc/nginx/conf.d/00-nautix.conf. */
  path: string;
  content: string;
  mode?: number;
}

const BLOCK = 512;

const octal = (value: number, width: number): string => value.toString(8).padStart(width - 1, "0");

const writeField = (header: Buffer, offset: number, width: number, text: string): void => {
  Buffer.from(text, "utf8").copy(header, offset, 0, width);
};

/**
 * Minimal ustar writer for a few small files. Paths are written relative to `/`, so extracting
 * the archive at `/` also creates missing parent directories, which the Docker archive API needs.
 */
export const buildTar = (files: TarFile[]): Buffer => {
  const blocks: Buffer[] = [];
  for (const file of files) {
    const name = file.path.replace(/^\/+/, "");
    if (Buffer.byteLength(name) > 100) throw new Error(`path too long for tar: ${file.path}`);
    const body = Buffer.from(file.content, "utf8");
    const header = Buffer.alloc(BLOCK);
    writeField(header, 0, 100, name);
    writeField(header, 100, 8, `${octal(file.mode ?? 0o644, 8)}\0`);
    writeField(header, 108, 8, `${octal(0, 8)}\0`); // uid
    writeField(header, 116, 8, `${octal(0, 8)}\0`); // gid
    writeField(header, 124, 12, `${octal(body.length, 12)}\0`);
    writeField(header, 136, 12, `${octal(Math.floor(Date.now() / 1000), 12)}\0`);
    header.fill(0x20, 148, 156); // checksum placeholder is eight spaces
    header[156] = "0".charCodeAt(0); // regular file
    writeField(header, 257, 6, "ustar\0");
    writeField(header, 263, 2, "00");
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    writeField(header, 148, 8, `${octal(checksum, 7)}\0`);
    blocks.push(header, body, Buffer.alloc((BLOCK - (body.length % BLOCK)) % BLOCK));
  }
  blocks.push(Buffer.alloc(BLOCK * 2)); // end-of-archive marker
  return Buffer.concat(blocks);
};
