import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AesGcmCipher } from "./aes-gcm-cipher.js";

describe("AesGcmCipher", () => {
  it("round-trips, never repeats ciphertext and rejects tampering", () => {
    const dir = mkdtempSync(join(tmpdir(), "nautix-key-"));
    const cipher = new AesGcmCipher(dir);
    const a = cipher.encrypt("s3cret");
    expect(a).not.toContain("s3cret");
    expect(cipher.encrypt("s3cret")).not.toBe(a);
    expect(cipher.decrypt(a)).toBe("s3cret");
    const [v, iv, tag, data] = a.split(".") as [string, string, string, string];
    const flipped = `${data[0] === "A" ? "B" : "A"}${data.slice(1)}`;
    expect(() => cipher.decrypt([v, iv, tag, flipped].join("."))).toThrow();
    expect(() => cipher.decrypt("v2.a.b.c")).toThrow();
  });

  it("keeps one key file (0600) and reuses it", () => {
    const dir = mkdtempSync(join(tmpdir(), "nautix-key-"));
    const sealed = new AesGcmCipher(dir).encrypt("x");
    expect(statSync(join(dir, ".key")).mode & 0o777).toBe(0o600);
    expect(new AesGcmCipher(dir).decrypt(sealed)).toBe("x");
    expect(readFileSync(join(dir, ".key"), "utf8").length).toBeGreaterThan(40);
  });
});
