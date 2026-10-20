import { X509Certificate } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { generate } from "selfsigned";
import type { AppConfig } from "./config.js";

export interface TlsMaterial {
  cert: string;
  key: string;
}

const RENEW_BEFORE_MS = 30 * 24 * 3600 * 1000;
const VALID_DAYS = 825;

const isIp = (value: string): boolean => /^[0-9.]+$/.test(value) || value.includes(":");

const altNames = (hosts: string[]) =>
  [...new Set(["localhost", "127.0.0.1", "::1", ...hosts])].map((host) =>
    isIp(host) ? { type: 7 as const, ip: host } : { type: 2 as const, value: host },
  );

const stillValid = (certPem: string, hosts: string[]): boolean => {
  try {
    const cert = new X509Certificate(certPem);
    if (new Date(cert.validTo).getTime() - Date.now() < RENEW_BEFORE_MS) return false;
    return hosts.every((h) => cert.checkHost(h) !== undefined || cert.checkIP(h) !== undefined);
  } catch {
    return false;
  }
};

/** Certificate and key to serve HTTPS with, or `undefined` when TLS is off. */
export const loadTls = async (config: AppConfig): Promise<TlsMaterial | undefined> => {
  const { tls } = config;
  if (tls.mode === "off") return undefined;
  if (tls.mode === "files") {
    return { cert: await readFile(tls.certFile, "utf8"), key: await readFile(tls.keyFile, "utf8") };
  }
  const dir = join(config.dataDir, "tls");
  const certPath = join(dir, "cert.pem");
  const keyPath = join(dir, "key.pem");
  try {
    const cert = await readFile(certPath, "utf8");
    if (stillValid(cert, tls.hosts)) return { cert, key: await readFile(keyPath, "utf8") };
  } catch {
    // none yet: generate below
  }
  const now = new Date();
  const pems = await generate([{ name: "commonName", value: "Nautix" }], {
    keyType: "ec",
    algorithm: "sha256",
    notBeforeDate: now,
    notAfterDate: new Date(now.getTime() + VALID_DAYS * 24 * 3600 * 1000),
    extensions: [
      { name: "basicConstraints", cA: false },
      { name: "subjectAltName", altNames: altNames(tls.hosts) },
    ],
  });
  await mkdir(dir, { recursive: true });
  await writeFile(certPath, pems.cert, { mode: 0o644 });
  await writeFile(keyPath, pems.private, { mode: 0o600 });
  await chmod(keyPath, 0o600);
  return { cert: pems.cert, key: pems.private };
};
