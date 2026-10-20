import { z } from "zod";

export const TlsMode = z.enum(["off", "local-ca", "custom", "external"]);
export type TlsMode = z.infer<typeof TlsMode>;

export const TlsStatus = z.object({
  mode: TlsMode,
  hosts: z.array(z.string()),
  validTo: z.string().nullable(),
  fingerprint: z.string().nullable(),
  ca: z.object({ fingerprint: z.string(), validTo: z.string() }).nullable(),
});
export type TlsStatus = z.infer<typeof TlsStatus>;

export const TlsHosts = z.object({ hosts: z.array(z.string().min(1).max(253)).max(30) });
export type TlsHosts = z.infer<typeof TlsHosts>;

export const TlsCustomCertificate = z.object({
  cert: z.string().min(1).max(100_000),
  key: z.string().min(1).max(20_000),
});
export type TlsCustomCertificate = z.infer<typeof TlsCustomCertificate>;
