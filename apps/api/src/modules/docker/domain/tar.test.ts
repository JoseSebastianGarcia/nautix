import { describe, expect, it } from "vitest";
import { buildTar } from "./tar.js";

const readEntries = (tar: Buffer) => {
  const out: { name: string; size: number; mode: string; body: string; checksumOk: boolean }[] = [];
  for (let off = 0; off + 512 <= tar.length; ) {
    const header = tar.subarray(off, off + 512);
    if (header.every((b) => b === 0)) break;
    const name = header.subarray(0, 100).toString().replace(/\0.*$/, "");
    const size = Number.parseInt(header.subarray(124, 136).toString().replace(/\0.*$/, ""), 8);
    const stored = Number.parseInt(header.subarray(148, 156).toString().replace(/\0.*$/, ""), 8);
    const copy = Buffer.from(header);
    copy.fill(0x20, 148, 156);
    const checksumOk = copy.reduce((s, b) => s + b, 0) === stored;
    out.push({
      name,
      size,
      mode: header.subarray(100, 108).toString().replace(/\0.*$/, ""),
      body: tar.subarray(off + 512, off + 512 + size).toString(),
      checksumOk,
    });
    off += 512 + Math.ceil(size / 512) * 512;
  }
  return out;
};

describe("buildTar", () => {
  it("writes valid ustar entries with relative names and correct checksums", () => {
    const entries = readEntries(
      buildTar([
        { path: "/etc/nginx/conf.d/00-nautix.conf", content: "server {}\n" },
        { path: "/etc/traefik/dynamic/nautix.yml", content: "x".repeat(1000), mode: 0o600 },
      ]),
    );
    expect(entries.map((e) => [e.name, e.size, e.checksumOk])).toEqual([
      ["etc/nginx/conf.d/00-nautix.conf", 10, true],
      ["etc/traefik/dynamic/nautix.yml", 1000, true],
    ]);
    expect(entries[0]?.body).toBe("server {}\n");
    expect(entries[1]?.mode).toBe("0000600");
  });

  it("is padded to 512-byte blocks and ends with two empty blocks", () => {
    const tar = buildTar([{ path: "/a", content: "hi" }]);
    expect(tar.length % 512).toBe(0);
    expect(tar.length).toBe(512 + 512 + 1024);
    expect(tar.subarray(tar.length - 1024).every((b) => b === 0)).toBe(true);
  });

  it("refuses paths that do not fit the header", () => {
    expect(() => buildTar([{ path: `/${"a".repeat(120)}`, content: "" }])).toThrow(/too long/);
  });
});
