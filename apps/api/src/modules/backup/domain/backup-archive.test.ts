import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { isBackupPath, packBackup, unpackBackup } from "./backup-archive.js";

describe("backup archive", () => {
  it("round-trips binary files", () => {
    const db = Buffer.from([0, 1, 2, 255, 254]);
    const out = unpackBackup(packBackup({ "nautix.db": db, ".key": Buffer.from("k") }));
    expect(out["nautix.db"]).toEqual(db);
    expect(out[".key"]?.toString()).toBe("k");
  });

  it("only accepts known files, so a crafted archive cannot write elsewhere", () => {
    expect(isBackupPath("nautix.db")).toBe(true);
    expect(isBackupPath("tls/ca-key.pem")).toBe(true);
    expect(isBackupPath("../etc/passwd")).toBe(false);
    expect(isBackupPath("tls/../../x")).toBe(false);
    expect(isBackupPath("/nautix.db")).toBe(false);
    const evil = gzipSync(
      JSON.stringify({
        format: "nautix-backup",
        version: 1,
        files: { "nautix.db": "AA==", "../x": "AA==" },
      }),
    );
    expect(() => unpackBackup(evil)).toThrow();
  });

  it("rejects non-backups and archives without a database", () => {
    expect(() => unpackBackup(Buffer.from("hello"))).toThrow();
    expect(() => unpackBackup(packBackup({ ".key": Buffer.from("k") }))).toThrow();
  });
});
