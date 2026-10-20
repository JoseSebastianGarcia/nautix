export interface PortSpec {
  ip?: string;
  /** Published (host) port or range; undefined means the engine picks one. */
  host?: string;
  container: string;
  protocol: "tcp" | "udp";
}

const isIp = (s: string): boolean => /^[0-9.]+$/.test(s) || s.startsWith("[") || s.includes(":");

/** Parses Compose port syntax: short strings ("127.0.0.1:8080:80/udp", "80", "[::1]:80:80") and long objects. */
export const parsePort = (value: unknown): PortSpec | null => {
  if (typeof value === "number")
    return Number.isInteger(value) ? { container: String(value), protocol: "tcp" } : null;
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    if (o.target === undefined) return null;
    const spec: PortSpec = {
      container: String(o.target),
      protocol: o.protocol === "udp" ? "udp" : "tcp",
    };
    if (o.published !== undefined) spec.host = String(o.published);
    if (typeof o.host_ip === "string") spec.ip = o.host_ip;
    return spec;
  }
  if (typeof value !== "string") return null;
  const [body, proto, ...extra] = value.trim().split("/");
  if (!body || extra.length > 0 || (proto !== undefined && proto !== "tcp" && proto !== "udp"))
    return null;
  let rest = body;
  let ip: string | undefined;
  if (rest.startsWith("[")) {
    const end = rest.indexOf("]");
    if (end < 0) return null;
    ip = rest.slice(1, end);
    rest = rest.slice(end + 2); // skip "]:"
  }
  const parts = rest.split(":");
  const port = /^\d+(-\d+)?$/;
  if (ip === undefined && parts.length === 3) ip = parts.shift();
  if (parts.length < 1 || parts.length > 2 || !parts.every((p) => port.test(p))) return null;
  if (ip !== undefined && !isIp(ip)) return null;
  const container = parts[parts.length - 1] as string;
  const spec: PortSpec = { container, protocol: proto === "udp" ? "udp" : "tcp" };
  if (parts.length === 2) spec.host = parts[0] as string;
  if (ip !== undefined) spec.ip = ip;
  return spec;
};

export const isLoopback = (ip: string | undefined): boolean =>
  ip !== undefined && (ip.startsWith("127.") || ip === "::1" || ip === "localhost");

/** True when the port is reachable from other machines (no host IP, or all interfaces). */
export const isPublic = (spec: PortSpec): boolean => !isLoopback(spec.ip);

export const formatPort = (spec: PortSpec): string => {
  const left = [spec.ip ? (spec.ip.includes(":") ? `[${spec.ip}]` : spec.ip) : undefined, spec.host]
    .filter((p) => p !== undefined)
    .join(":");
  return `${left ? `${left}:` : ""}${spec.container}${spec.protocol === "udp" ? "/udp" : ""}`;
};
