import { z } from "zod";

const IPV4 = /^((25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(25[0-5]|2[0-4]\d|1?\d?\d)$/;

export const isIpv4 = (value: string): boolean => IPV4.test(value);

const toInt = (ip: string): number =>
  ip.split(".").reduce((acc, part) => acc * 256 + Number(part), 0);

export interface Subnet {
  network: number;
  broadcast: number;
}

/** `172.30.0.0/24` → its first and last address (null when it is not an IPv4 CIDR). */
export const parseSubnet = (cidr: string): Subnet | null => {
  const [base, bits, extra] = cidr.split("/");
  if (!base || bits === undefined || extra !== undefined || !IPV4.test(base)) return null;
  const n = Number(bits);
  if (!Number.isInteger(n) || n < 8 || n > 30) return null;
  const size = 2 ** (32 - n);
  const network = Math.floor(toInt(base) / size) * size;
  return { network, broadcast: network + size - 1 };
};

export type FixedIpProblem =
  | "invalid"
  | "noSubnet"
  | "outsideSubnet"
  | "reserved"
  | "gateway"
  | "inUse";

/**
 * Whether `ip` can be the fixed address of a container on a network with this subnet.
 * `taken` are the addresses other containers already use there. Returns null when it is fine.
 */
export const checkFixedIp = (
  ip: string,
  subnet: string | null,
  taken: readonly string[],
): FixedIpProblem | null => {
  if (!IPV4.test(ip)) return "invalid";
  const range = subnet ? parseSubnet(subnet) : null;
  if (!range) return "noSubnet";
  const n = toInt(ip);
  if (n < range.network || n > range.broadcast) return "outsideSubnet";
  if (n === range.network || n === range.broadcast) return "reserved";
  if (n === range.network + 1) return "gateway"; // Docker gives the first address to the bridge
  if (taken.includes(ip)) return "inUse";
  return null;
};

export const SetFixedIp = z.object({
  /** Network name or id. */
  network: z.string().min(1).max(128),
  /** null = back to an automatic address. */
  ip: z.string().regex(IPV4, "invalid IPv4 address").nullable(),
});
export type SetFixedIp = z.infer<typeof SetFixedIp>;
