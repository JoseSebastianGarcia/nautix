/** Address validation shared by DNS records, port bindings and gateway filters (pure: no node:net). */
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

/** `10.0.0.0/24`, `192.168.1.5/32`, `fd00::/8`; a bare address counts as a single host. */
export const isCidr = (value: string): boolean => {
  const [address, prefix, ...rest] = value.split("/");
  if (rest.length > 0 || !address || !isIpAddress(address)) return false;
  if (prefix === undefined) return true;
  if (!/^\d{1,3}$/.test(prefix)) return false;
  return Number(prefix) <= (ipFamily(address) === 6 ? 128 : 32);
};

const toBits = (address: string): bigint | null => {
  if (!isIpAddress(address)) return null;
  if (ipFamily(address) === 4)
    return address.split(".").reduce((n, part) => (n << 8n) | BigInt(part), 0n);
  // IPv6: expand "::", and a dotted IPv4 tail counts as two groups.
  const [head = "", tail = ""] = address.split("::");
  const groups = (text: string): string[] =>
    text === ""
      ? []
      : text.split(":").flatMap((g) => {
          if (!g.includes(".")) return [g];
          const v4 = toBits(g) ?? 0n;
          return [((v4 >> 16n) & 0xffffn).toString(16), (v4 & 0xffffn).toString(16)];
        });
  const left = groups(head);
  const right = address.includes("::") ? groups(tail) : [];
  const middle = address.includes("::") ? Array(8 - left.length - right.length).fill("0") : [];
  return [...left, ...middle, ...right].reduce((n, g) => (n << 16n) | BigInt(`0x${g}`), 0n);
};

/** True when `address` lies inside `cidr` (a bare address matches only itself). Families never mix. */
export const cidrContains = (cidr: string, address: string): boolean => {
  const [base = "", prefix] = cidr.split("/");
  if (!isCidr(cidr) || !isIpAddress(address) || ipFamily(base) !== ipFamily(address)) return false;
  const size = ipFamily(base) === 6 ? 128n : 32n;
  const bits = prefix === undefined ? size : BigInt(prefix);
  const a = toBits(base);
  const b = toBits(address);
  if (a === null || b === null) return false;
  const shift = size - bits;
  return a >> shift === b >> shift;
};
