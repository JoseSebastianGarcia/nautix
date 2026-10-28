import { bindString, type Template } from "@nautix/contracts";

export interface NewService {
  name: string;
  definition: Record<string, unknown>;
  /** Named volumes to declare at the top level. */
  volumes: string[];
}

/** First host port not in `used`, starting at `preferred`. */
export const pickHostPort = (preferred: number, used: ReadonlySet<number>): number => {
  let port = preferred;
  while (used.has(port) && port < 65535) port++;
  return port;
};

/**
 * Compose service for a catalog template. Published ports bind to 127.0.0.1 and data paths use
 * named volumes, matching what the canvas deploys. `box` is the network the service joins.
 */
export const templateToService = (
  template: Template,
  name: string,
  opts: { box?: string; usedHostPorts: ReadonlySet<number>; random: () => string },
): NewService => {
  // TCP and UDP are separate port spaces: DNS uses 53/tcp and 53/udp on the same number.
  const used = { tcp: new Set(opts.usedHostPorts), udp: new Set(opts.usedHostPorts) };
  const ports = template.ports.map((p) => {
    const protocol = p.protocol ?? "tcp";
    const host = pickHostPort(p.hostPort ?? p.containerPort, used[protocol]);
    used[protocol].add(host);
    return `127.0.0.1:${host}:${p.containerPort}${protocol === "udp" ? "/udp" : ""}`;
  });
  const named = (template.volumes ?? []).map(
    (path, i) => `${name}-data${i === 0 ? "" : `-${i + 1}`}:${path}`,
  );
  // Folder mappings are binds, not named volumes: they are written in the service but never declared at the top.
  const binds = (template.mounts ?? []).map(bindString);
  const volumes = [...named, ...binds];
  const env = Object.fromEntries(
    Object.entries(template.env ?? {}).map(([k, v]) => [k, v === "change-me" ? opts.random() : v]),
  );
  const definition: Record<string, unknown> = { image: template.image, restart: "unless-stopped" };
  if (template.command) definition.command = template.command;
  if (ports.length) definition.ports = ports;
  if (Object.keys(env).length) definition.environment = env;
  if (volumes.length) definition.volumes = volumes;
  if (opts.box) definition.networks = [opts.box];
  return { name, definition, volumes: named.map((v) => v.split(":")[0] as string) };
};
