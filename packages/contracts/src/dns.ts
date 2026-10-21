import { z } from "zod";
import { ResourceName } from "./docker.js";
import { ipFamily, isIpAddress } from "./ip.js";

/** DNS servers Nautix can edit records for (detected from the image name). One adapter each. */
export const DNS_KINDS = ["dnsmasq", "coredns"] as const;
export type DnsKind = (typeof DNS_KINDS)[number];

const EDITABLE: Record<DnsKind, RegExp> = {
  // dockurr/dnsmasq reads /etc/dnsmasq.d/*.conf, which Nautix owns one file of.
  dnsmasq: /(^|\/)dockurr\/dnsmasq(:|$|@)/,
  // CoreDNS has no shell: Nautix writes its Corefile and the `reload` plugin picks it up.
  coredns: /(^|\/)coredns\/coredns(:|$|@)/,
};

export const dnsKind = (image: string): DnsKind | null => {
  const name = image.toLowerCase();
  return DNS_KINDS.find((k) => EDITABLE[k].test(name)) ?? null;
};

export interface DnsInfo {
  label: string;
  /** How a change reaches the running server. */
  applies: "restart" | "reload";
  /** A name also answers for its subdomains. */
  subdomains: boolean;
  /** Records can be written while the container is stopped, and applying starts it (its image cannot boot without them). */
  writesWhileStopped: boolean;
}

export const DNS_INFO: Record<DnsKind, DnsInfo> = {
  dnsmasq: { label: "dnsmasq", applies: "restart", subdomains: true, writesWhileStopped: false },
  coredns: { label: "CoreDNS", applies: "reload", subdomains: true, writesWhileStopped: true },
};

/** Any DNS server image Nautix recognises, even those it cannot edit yet (shown with a reason). */
export const isDnsImage = (image: string): boolean =>
  /(dnsmasq|adguard|pihole|pi-hole|coredns|bind9|unbound)/i.test(image);

const LABEL = "[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?";
export const HOSTNAME = new RegExp(`^(${LABEL}\\.)*${LABEL}$`);
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

/**
 * What the user saves: a name that points at an IP address, or at a container by name. A container
 * is resolved to its current IP every time the records are applied, so the name keeps working after
 * the container is recreated with a different address.
 */
export const DnsEntry = z.union([
  DnsRecord,
  z.object({
    name: DnsRecord.shape.name,
    container: ResourceName,
  }),
]);
export type DnsEntry = z.infer<typeof DnsEntry>;

/** Container targets resolve to IPv4, so they count as the IPv4 record of the name. */
export const entryFamily = (e: DnsEntry): 4 | 6 => ("ip" in e ? ipFamily(e.ip) : 4);

export const SaveDnsRecords = z.object({
  records: z
    .array(DnsEntry)
    .max(500)
    .refine(
      (list) => new Set(list.map((r) => `${r.name}/${entryFamily(r)}`)).size === list.length,
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
