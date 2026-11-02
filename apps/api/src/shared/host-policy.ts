import { isIP } from "node:net";

/** The name in a `Host` header, lower-case and without the port (`[::1]:3737` -> `::1`). */
export const hostnameOf = (header: string | undefined): string | null => {
  if (!header) return null;
  const value = header.trim().toLowerCase();
  if (value.startsWith("[")) {
    const end = value.indexOf("]");
    return end > 0 ? value.slice(1, end) : null;
  }
  const colon = value.lastIndexOf(":");
  return colon === -1 ? value : value.slice(0, colon);
};

/**
 * Which `Host` names Nautix answers to (ADR-063). A page on another site that resolves its own name to
 * 127.0.0.1 (DNS rebinding) reaches Nautix with its own name in `Host`; refusing every name that is not the
 * machine itself, an IP address or one the person listed closes that door. `*` in the list turns the check
 * off, for setups behind a proxy with many names.
 */
export class HostPolicy {
  constructor(private readonly allowed: () => string[]) {}

  allows(header: string | undefined): boolean {
    const name = hostnameOf(header);
    if (!name) return false;
    if (isIP(name) !== 0 || name === "localhost" || name.endsWith(".localhost")) return true;
    return this.allowed().some((h) => h === "*" || h.toLowerCase() === name);
  }
}
