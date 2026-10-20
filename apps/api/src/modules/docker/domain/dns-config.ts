import { isIP } from "node:net";
import { type DnsRecord, HOSTNAME } from "@nautix/contracts";
import { ValidationError } from "../../../shared/domain-error.js";

const BANNER =
  "# Managed by Nautix. Edit the records in the DNS tab; manual changes are overwritten.";

export const DNSMASQ_DIR = "/etc/dnsmasq.d";
export const DNSMASQ_FILE = `${DNSMASQ_DIR}/nautix.conf`;

/**
 * dnsmasq `address=/name/ip`: the name and every subdomain of it answer with that address. Values are
 * checked again here so nothing but a hostname and an IP can reach the file.
 */
export const buildDnsmasqConfig = (records: DnsRecord[]): string => {
  const lines = [...records]
    .sort((a, b) => a.name.localeCompare(b.name) || a.ip.localeCompare(b.ip))
    .map((r) => {
      if (!HOSTNAME.test(r.name) || isIP(r.ip) === 0)
        throw new ValidationError(`invalid record ${r.name} → ${r.ip}`, "errors.dnsInvalidRecord");
      return `address=/${r.name}/${r.ip}`;
    });
  return [BANNER, ...lines, ""].join("\n");
};

/** Validates the new file with dnsmasq itself, then swaps it in; a rejected file never replaces the old one. */
export const DNSMASQ_SCRIPT = `set -e
cd ${DNSMASQ_DIR}
if dnsmasq --test --conf-file=nautix.conf.new; then
  mv -f nautix.conf.new nautix.conf
else
  rm -f nautix.conf.new
  echo "configuration rejected; the previous one is still in use" >&2
  exit 1
fi`;
