import type { Container, ContainerDetails, Network } from "@nautix/contracts";

export interface ComposeDocument {
  name: string;
  services: Record<string, Record<string, unknown>>;
  networks?: Record<string, Record<string, unknown>>;
  volumes?: Record<string, Record<string, never>>;
}

export interface ExportInput {
  containers: Container[];
  details: ContainerDetails[];
  networks: Network[];
  /** false → env values become `${KEY}` placeholders so secrets don't leak into the file. */
  includeEnv: boolean;
}

const portLine = (p: Container["ports"][number]): string | null => {
  if (p.publicPort === undefined) return null;
  const ip = p.ip && p.ip !== "::" ? `${p.ip}:` : "";
  return `${ip}${p.publicPort}:${p.privatePort}${p.type === "udp" ? "/udp" : ""}`;
};

/**
 * Pure mapping from engine state to a Compose document.
 * Boxes (user networks) become Compose networks; containers outside every box keep
 * `network_mode: bridge`. Published ports keep their host IP, so the 127.0.0.1 protection survives.
 */
export const toCompose = ({
  containers,
  details,
  networks,
  includeEnv,
}: ExportInput): ComposeDocument => {
  const byName = new Map(networks.map((n) => [n.name, n]));
  const detailById = new Map(details.map((d) => [d.id, d]));
  const services: ComposeDocument["services"] = {};
  const usedNetworks = new Set<string>();
  const namedVolumes = new Set<string>();

  for (const c of [...containers].sort((a, b) => a.name.localeCompare(b.name))) {
    const d = detailById.get(c.id);
    const userNets = c.networks.filter((n) => byName.get(n)?.system === false);
    const service: Record<string, unknown> = { image: c.image, container_name: c.name };

    const restart = d?.restartPolicy;
    if (restart && restart !== "no") service.restart = restart;
    if (d?.command?.length) service.command = d.command;

    const ports = c.ports.map(portLine).filter((p): p is string => p !== null);
    if (ports.length) service.ports = [...new Set(ports)];

    const env = Object.entries(d?.env ?? {});
    if (env.length) {
      service.environment = Object.fromEntries(
        env.map(([k, v]) => [k, includeEnv ? v : `\${${k}}`]),
      );
    }

    const volumes = (d?.mounts ?? []).flatMap((m) => {
      if (m.type === "tmpfs") return [];
      const ro = m.readOnly ? ":ro" : "";
      if (m.type === "volume") {
        namedVolumes.add(m.source);
        return [`${m.source}:${m.target}${ro}`];
      }
      return [`${m.source}:${m.target}${ro}`];
    });
    if (volumes.length) service.volumes = volumes;

    if (userNets.length) {
      service.networks = userNets;
      for (const n of userNets) usedNetworks.add(n);
    } else {
      service.network_mode = "bridge";
    }
    services[c.name] = service;
  }

  const doc: ComposeDocument = { name: "nautix-export", services };
  if (usedNetworks.size) {
    doc.networks = Object.fromEntries(
      [...usedNetworks].sort().map((name) => {
        const n = byName.get(name);
        const def: Record<string, unknown> = {};
        if (n?.internal) def.internal = true;
        if (n?.subnet) def.ipam = { config: [{ subnet: n.subnet }] };
        return [name, def];
      }),
    );
  }
  if (namedVolumes.size)
    doc.volumes = Object.fromEntries([...namedVolumes].sort().map((v) => [v, {}]));
  return doc;
};
