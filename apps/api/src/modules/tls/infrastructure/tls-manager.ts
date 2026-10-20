import { createPrivateKey, X509Certificate } from "node:crypto";
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import type { Server } from "node:https";
import { join } from "node:path";
import { generate } from "selfsigned";
import type { AppConfig } from "../../../shared/config.js";
import { ValidationError } from "../../../shared/domain-error.js";
import { TlsCertificates, type TlsStatus } from "../application/ports/tls-certificates.js";

const DAY = 24 * 3600 * 1000;
const RENEW_BEFORE_MS = 30 * DAY;
const LEAF_DAYS = 825;
const CA_DAYS = 3650;
const BASE_HOSTS = ["localhost", "127.0.0.1", "::1"];
const HOSTNAME =
  /^(?=.{1,253}$)([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
const IPV6 = /^[0-9a-fA-F:]+$/;

const isIp = (v: string): boolean => IPV4.test(v) || (v.includes(":") && IPV6.test(v));

interface Pem {
  cert: string;
  key: string;
}

/**
 * Keeps the HTTPS certificate under `<data>/tls`: a local root CA (created once, to be trusted by
 * the operator) that signs a leaf for localhost plus the configured names/IPs, or the operator's
 * own certificate. Changes are applied to the running listener without a restart.
 */
export class TlsManager extends TlsCertificates {
  private server: Server | undefined;
  private current: Pem | undefined;

  private constructor(
    private readonly config: AppConfig,
    private hosts: string[],
    private readonly dir: string,
  ) {
    super();
  }

  static async create(config: AppConfig): Promise<TlsManager | undefined> {
    const { tls } = config;
    if (tls.mode === "off") return undefined;
    const dir = join(config.dataDir, "tls");
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const manager = new TlsManager(config, [], dir);
    if (tls.mode === "files") {
      manager.current = {
        cert: await readFile(tls.certFile, "utf8"),
        key: await readFile(tls.keyFile, "utf8"),
      };
      return manager;
    }
    manager.hosts = await manager.readHosts(tls.hosts);
    manager.current = await manager.load();
    return manager;
  }

  material(): Pem {
    if (!this.current) throw new Error("certificate not loaded");
    return this.current;
  }

  attach(server: Server): void {
    this.server = server;
  }

  private get external(): boolean {
    return this.config.tls.mode === "files";
  }

  private path = (name: string): string => join(this.dir, name);

  private async readHosts(fromEnv: string[]): Promise<string[]> {
    try {
      const saved = JSON.parse(await readFile(this.path("hosts.json"), "utf8")) as string[];
      return this.normalise(saved);
    } catch {
      return this.normalise(fromEnv);
    }
  }

  private normalise(hosts: string[]): string[] {
    const extra = hosts.map((h) => h.trim().toLowerCase()).filter((h) => h !== "");
    for (const h of extra)
      if (!isIp(h) && !HOSTNAME.test(h))
        throw new ValidationError(`invalid host: ${h}`, "errors.tlsHost");
    return [...new Set(extra)].filter((h) => !BASE_HOSTS.includes(h)).slice(0, 30);
  }

  private async load(): Promise<Pem> {
    const custom = await this.readPair("custom-cert.pem", "custom-key.pem");
    if (custom) return custom;
    const existing = await this.readPair("cert.pem", "key.pem");
    if (existing && this.leafStillGood(existing.cert)) return existing;
    return this.issueLeaf();
  }

  private async readPair(certName: string, keyName: string): Promise<Pem | undefined> {
    try {
      return {
        cert: await readFile(this.path(certName), "utf8"),
        key: await readFile(this.path(keyName), "utf8"),
      };
    } catch {
      return undefined;
    }
  }

  private leafStillGood(certPem: string): boolean {
    try {
      const cert = new X509Certificate(certPem);
      if (new Date(cert.validTo).getTime() - Date.now() < RENEW_BEFORE_MS) return false;
      return [...BASE_HOSTS, ...this.hosts].every((h) =>
        isIp(h) ? cert.checkIP(h) !== undefined : cert.checkHost(h) !== undefined,
      );
    } catch {
      return false;
    }
  }

  private async ensureCa(): Promise<Pem> {
    const existing = await this.readPair("ca.pem", "ca-key.pem");
    if (existing) {
      try {
        if (new Date(new X509Certificate(existing.cert).validTo).getTime() > Date.now())
          return existing;
      } catch {
        // regenerate below
      }
    }
    const now = new Date();
    const pems = await generate([{ name: "commonName", value: "Nautix local CA" }], {
      keyType: "ec",
      algorithm: "sha256",
      notBeforeDate: now,
      notAfterDate: new Date(now.getTime() + CA_DAYS * DAY),
      extensions: [
        { name: "basicConstraints", cA: true, critical: true },
        { name: "keyUsage", keyCertSign: true, cRLSign: true, critical: true },
      ],
    });
    await writeFile(this.path("ca.pem"), pems.cert, { mode: 0o644 });
    await writeFile(this.path("ca-key.pem"), pems.private, { mode: 0o600 });
    await chmod(this.path("ca-key.pem"), 0o600);
    return { cert: pems.cert, key: pems.private };
  }

  private async issueLeaf(): Promise<Pem> {
    const ca = await this.ensureCa();
    const now = new Date();
    const altNames = [...BASE_HOSTS, ...this.hosts].map((h) =>
      isIp(h) ? { type: 7 as const, ip: h } : { type: 2 as const, value: h },
    );
    const pems = await generate([{ name: "commonName", value: "Nautix" }], {
      keyType: "ec",
      algorithm: "sha256",
      notBeforeDate: now,
      notAfterDate: new Date(now.getTime() + LEAF_DAYS * DAY),
      ca: { key: ca.key, cert: ca.cert },
      extensions: [
        { name: "basicConstraints", cA: false },
        { name: "keyUsage", digitalSignature: true, keyEncipherment: true, critical: true },
        { name: "extKeyUsage", serverAuth: true },
        { name: "subjectAltName", altNames },
      ],
    });
    await writeFile(this.path("cert.pem"), pems.cert, { mode: 0o644 });
    await writeFile(this.path("key.pem"), pems.private, { mode: 0o600 });
    await chmod(this.path("key.pem"), 0o600);
    return { cert: pems.cert, key: pems.private };
  }

  private apply(pem: Pem): void {
    this.current = pem;
    this.server?.setSecureContext({ cert: pem.cert, key: pem.key });
  }

  status(): TlsStatus {
    const mode = this.external ? "external" : this.isCustom ? "custom" : "local-ca";
    const cert = this.current ? new X509Certificate(this.current.cert) : undefined;
    const caCert = this.caCert;
    return {
      mode,
      hosts: this.external ? [] : [...BASE_HOSTS, ...this.hosts],
      validTo: cert ? new Date(cert.validTo).toISOString() : null,
      fingerprint: cert?.fingerprint256 ?? null,
      ca:
        caCert && !this.external
          ? { fingerprint: caCert.fingerprint256, validTo: new Date(caCert.validTo).toISOString() }
          : null,
    };
  }

  private isCustom = false;
  private caCert: X509Certificate | undefined;

  /** Loads the flags `status()` reports; called after every change. */
  private async refreshFlags(): Promise<void> {
    this.isCustom = (await this.readPair("custom-cert.pem", "custom-key.pem")) !== undefined;
    const ca = await this.readPair("ca.pem", "ca-key.pem");
    this.caCert = ca ? new X509Certificate(ca.cert) : undefined;
    this.caCertPem = ca?.cert;
  }

  async init(): Promise<void> {
    if (this.external) return;
    await this.ensureCa();
    await this.refreshFlags();
  }

  caPem(): string | null {
    return this.external ? null : (this.caCertPem ?? null);
  }

  private caCertPem: string | undefined;

  async setHosts(hosts: string[]): Promise<TlsStatus> {
    this.assertManaged();
    this.hosts = this.normalise(hosts);
    await writeFile(this.path("hosts.json"), JSON.stringify(this.hosts));
    if (!this.isCustom) this.apply(await this.issueLeaf());
    await this.refreshFlags();
    return this.status();
  }

  async setCustom(certPem: string, keyPem: string): Promise<TlsStatus> {
    this.assertManaged();
    try {
      const cert = new X509Certificate(certPem);
      if (!cert.checkPrivateKey(createPrivateKey(keyPem)))
        throw new ValidationError(
          "the private key does not match the certificate",
          "errors.tlsInvalid",
        );
      if (new Date(cert.validTo).getTime() < Date.now())
        throw new ValidationError("the certificate has expired", "errors.tlsExpired");
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      throw new ValidationError("not a valid PEM certificate and private key", "errors.tlsInvalid");
    }
    await writeFile(this.path("custom-cert.pem"), certPem, { mode: 0o644 });
    await writeFile(this.path("custom-key.pem"), keyPem, { mode: 0o600 });
    await chmod(this.path("custom-key.pem"), 0o600);
    this.apply({ cert: certPem, key: keyPem });
    await this.refreshFlags();
    return this.status();
  }

  async removeCustom(): Promise<TlsStatus> {
    this.assertManaged();
    await rm(this.path("custom-cert.pem"), { force: true });
    await rm(this.path("custom-key.pem"), { force: true });
    this.apply(await this.issueLeaf());
    await this.refreshFlags();
    return this.status();
  }

  private assertManaged(): void {
    if (this.external)
      throw new ValidationError(
        "the certificate comes from NAUTIX_TLS_CERT / NAUTIX_TLS_KEY",
        "errors.tlsExternal",
      );
  }
}
