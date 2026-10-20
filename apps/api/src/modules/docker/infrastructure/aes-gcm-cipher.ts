import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const KEY_BYTES = 32;

/**
 * AES-256-GCM with a key kept in `<data>/.key` (mode 0600, created on first use).
 * Format: `v1.<iv>.<tag>.<ciphertext>` (base64url).
 */
export class AesGcmCipher {
  private readonly key: Buffer;

  constructor(dataDir: string) {
    const path = join(dataDir, ".key");
    if (existsSync(path)) {
      this.key = Buffer.from(readFileSync(path, "utf8").trim(), "base64url");
    } else {
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
      this.key = randomBytes(KEY_BYTES);
      writeFileSync(path, this.key.toString("base64url"), { mode: 0o600 });
      chmodSync(path, 0o600);
    }
    if (this.key.length !== KEY_BYTES) throw new Error("invalid encryption key file");
  }

  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    return ["v1", iv, cipher.getAuthTag(), data]
      .map((p) => (typeof p === "string" ? p : p.toString("base64url")))
      .join(".");
  }

  decrypt(sealed: string): string {
    const [version, iv, tag, data] = sealed.split(".");
    if (version !== "v1" || !iv || !tag || data === undefined)
      throw new Error("unknown secret format");
    const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(data, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  }
}
