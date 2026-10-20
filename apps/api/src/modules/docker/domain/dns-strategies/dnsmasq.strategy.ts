import type { DnsRecord } from "@nautix/contracts";
import { BANNER, type DnsPlan, DnsStrategy } from "../dns-strategy.js";

const DIR = "/etc/dnsmasq.d";

/**
 * dnsmasq `address=/name/ip`: the name and every subdomain of it answer with that address. A name
 * with only an IPv4 answers "no such record" for AAAA instead of asking upstream, as dnsmasq does.
 */
export const buildDnsmasqConfig = (records: DnsRecord[]): string => {
  const lines = [...records]
    .sort((a, b) => a.name.localeCompare(b.name) || a.ip.localeCompare(b.ip))
    .map((r) => `address=/${r.name}/${r.ip}`);
  return [`# ${BANNER}`, ...lines, ""].join("\n");
};

/** Validates the new file with dnsmasq itself, then swaps it in; a rejected file never replaces the old one. */
const SCRIPT = `set -e
cd ${DIR}
if dnsmasq --test --conf-file=nautix.conf.new; then
  mv -f nautix.conf.new nautix.conf
else
  rm -f nautix.conf.new
  echo "configuration rejected; the previous one is still in use" >&2
  exit 1
fi`;

/** dockurr/dnsmasq: one drop-in file; dnsmasq reads its configuration only at start, so the container restarts. */
export class DnsmasqStrategy extends DnsStrategy {
  readonly kind = "dnsmasq" as const;

  protected build(records: DnsRecord[]): DnsPlan {
    return {
      files: [{ path: `${DIR}/nautix.conf.new`, content: buildDnsmasqConfig(records) }],
      commands: [["sh", "-c", SCRIPT]],
      apply: { type: "restart" },
    };
  }
}
