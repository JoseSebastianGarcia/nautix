import { z } from "zod";

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
const IPV4 = /^((25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(25[0-5]|2[0-4]\d|1?\d?\d)$/;
const HEXTET = /^[0-9a-fA-F]{1,4}$/;

/** Strict IPv6 (no zone id): up to 8 groups, one `::` at most, optional dotted IPv4 tail. */
const isIpv6 = (value: string): boolean => {
  if (!value.includes(":") || value.length > 45) return false;
  const halves = value.split("::");
  if (halves.length > 2) return false;
  const parse = (part: string): string[] | null => (part === "" ? [] : part.split(":"));
  const head = parse(halves[0] ?? "");
  const tail = halves.length === 2 ? parse(halves[1] ?? "") : [];
  if (!head || !tail) return false;
  const groups = [...head, ...tail];
  let width = 0;
  for (const [i, g] of groups.entries()) {
    if (i === groups.length - 1 && g.includes(".")) {
      if (!IPV4.test(g)) return false;
      width += 2;
    } else if (HEXTET.test(g)) width += 1;
    else return false;
  }
  return halves.length === 2 ? width <= 7 : width === 8;
};

export const isIpAddress = (value: string): boolean => IPV4.test(value) || isIpv6(value);

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
