import {
  type Container,
  GATEWAY_INFO,
  type GatewayKind,
  type GatewayRoute,
  gatewayKind,
  tunnelFromContainer,
} from "@nautix/contracts";

export interface Candidate {
  /** Container name, resolvable by the gateway through Docker's DNS. */
  name: string;
  port: number | null;
  label: string;
}

/** Services the gateway can reach by name: containers sharing a network with it (tunnels included). */
export const candidatesFor = (gateway: Container, containers: Container[]): Candidate[] =>
  containers
    .filter((c) => c.id !== gateway.id && c.networks.some((n) => gateway.networks.includes(n)))
    .flatMap((c): Candidate[] => {
      const tunnel = tunnelFromContainer(c);
      const ports = [...new Set(c.ports.map((p) => p.privatePort))];
      if (tunnel) {
        return [
          {
            name: c.name,
            port: tunnel.listenPort,
            label: `${c.name} → ${tunnel.targetName}:${tunnel.targetPort} (${tunnel.to})`,
          },
        ];
      }
      return ports.length === 0
        ? [{ name: c.name, port: null, label: c.name }]
        : ports.map((port) => ({ name: c.name, port, label: `${c.name}:${port}` }));
    });

export const upstreamFor = (c: Candidate): string => `http://${c.name}:${c.port ?? 80}`;

/** Host port Docker published for the gateway's proxy (8000) and admin (8001) ports, if any. */
export const publishedPort = (gateway: Container, privatePort: number): number | null =>
  gateway.ports.find((p) => p.privatePort === privatePort && p.publicPort !== undefined)
    ?.publicPort ?? null;

/** Kong, Nginx, Caddy and Traefik containers (tunnels use socat, so they never match). */
export const gateways = (containers: Container[]): Container[] =>
  containers.filter((c) => gatewayKind(c.image) !== null && tunnelFromContainer(c) === null);

export const kindOf = (c: Container): GatewayKind | null => gatewayKind(c.image);

/** Host port published for the gateway's traffic port (8000 for Kong, 80 for the proxies). */
export const trafficPort = (c: Container): number | null => {
  const kind = kindOf(c);
  return kind ? publishedPort(c, GATEWAY_INFO[kind].proxyPort) : null;
};

export interface DraftRoute {
  name: string;
  path: string;
  host: string;
  upstream: string;
  stripPath: boolean;
}

export const blankRoute = (existing: DraftRoute[]): DraftRoute => {
  let n = existing.length + 1;
  while (existing.some((r) => r.name === `ruta-${n}`)) n++;
  return { name: `ruta-${n}`, path: `/ruta-${n}`, host: "", upstream: "", stripPath: true };
};

export const toDraft = (r: GatewayRoute): DraftRoute => ({
  name: r.name,
  path: r.path ?? "",
  host: r.host ?? "",
  upstream: r.upstream,
  stripPath: r.stripPath,
});

/** Draft rows → API routes (empty path/host are omitted). */
export const fromDraft = (d: DraftRoute): unknown => ({
  name: d.name.trim(),
  ...(d.path.trim() ? { path: d.path.trim() } : {}),
  ...(d.host.trim() ? { host: d.host.trim() } : {}),
  upstream: d.upstream.trim(),
  stripPath: d.stripPath,
});
