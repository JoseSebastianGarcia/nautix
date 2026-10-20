export type TlsMode = "off" | "local-ca" | "custom" | "external";

export interface TlsStatus {
  mode: TlsMode;
  hosts: string[];
  validTo: string | null;
  fingerprint: string | null;
  ca: { fingerprint: string; validTo: string } | null;
}

/** Port: the certificate the HTTPS listener serves, managed from the settings page. */
export abstract class TlsCertificates {
  abstract status(): TlsStatus;
  /** PEM of the local root CA to install in the OS / browser trust store, if there is one. */
  abstract caPem(): string | null;
  /** Reissues the local-CA certificate for these names/IPs and serves it right away. */
  abstract setHosts(hosts: string[]): Promise<TlsStatus>;
  /** Serves the operator's own certificate (PEM chain + private key) instead of the local CA's. */
  abstract setCustom(certPem: string, keyPem: string): Promise<TlsStatus>;
  abstract removeCustom(): Promise<TlsStatus>;
}
