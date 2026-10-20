import { z } from "zod";

/** DNS servers Nautix can edit records for (detected from the image name). */
export const DNS_KINDS = ["dnsmasq"] as const;
export type DnsKind = (typeof DNS_KINDS)[number];

const EDITABLE: Record<DnsKind, RegExp> = {
  // dockurr/dnsmasq reads /etc/dnsmasq.d/*.conf, which Nautix owns one file of.
  dnsmasq: /(^|\/)dockurr\/dnsmasq(:|$|@)/,
};

export const dnsKind = (image: string): DnsKind | null => {
  const name = image.toLowerCase();
  return DNS_KINDS.find((k) => EDITABLE[k].test(name)) ?? null;
};

/** Any DNS server image Nautix recognises, even those it cannot edit yet (shown with a reason). */
export const isDnsImage = (image: string): boolean =>
  /(dnsmasq|adguard|pihole|pi-hole|coredns|bind9|unbound)/i.test(image);

const LABEL = "[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?";
export const HOSTNAME = new RegExp(`^(${LABEL}\\.)*${LABEL}$`);
const IPV4 = /^((25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(25[0-5]|2[0-4]\d|1?\d?\d)$/;
const IPV6 = /^[0-9a-fA-F:]+(%[a-z0-9]+)?$/;

export const isIpAddress = (value: string): boolean =>
  IPV4.test(value) || (value.includes(":") && IPV6.test(value) && value.length <= 45);

export const ipFamily = (value: string): 4 | 6 => (value.includes(":") ? 6 : 4);

export const DnsRecord = z.object({
  /** A name and all of its subdomains resolve to `ip` (dnsmasq `address=/name/ip`). */
  name: z
    .string()
    .trim()
    .toLowerCase()
    .max(253)
    .refine((v) => HOSTNAME.test(v), "invalid domain name"),
  ip: z.string().trim().refine(isIpAddress, "invalid IP address"),
});
export type DnsRecord = z.infer<typeof DnsRecord>;

export const SaveDnsRecords = z.object({
  records: z
    .array(DnsRecord)
    .max(500)
    .refine(
      (list) => new Set(list.map((r) => `${r.name}/${ipFamily(r.ip)}`)).size === list.length,
      "a name can have one IPv4 and one IPv6 address",
    ),
});
export type SaveDnsRecords = z.infer<typeof SaveDnsRecords>;

export interface DnsServer {
  id: string;
  name: string;
  image: string;
  /** null = recognised as a DNS server but not editable from Nautix. */
  kind: DnsKind | null;
  state: string;
  networks: string[];
  /** IP of the server on each network it joined (what other containers use as their DNS). */
  ips: Record<string, string>;
}

export interface DnsApplyResult {
  ok: boolean;
  output: string;
}
