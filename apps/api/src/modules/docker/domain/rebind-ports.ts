/** One published port whose host address changes. */
export interface PortRebind {
  containerPort: number;
  protocol: "tcp" | "udp";
  hostIp: string;
}

/** The parts of `GET /containers/{id}/json` that recreating a container needs. */
export interface InspectedContainer {
  Id: string;
  Name: string;
  Config: Record<string, unknown> & { Hostname?: string };
  HostConfig: Record<string, unknown> & {
    PortBindings?: Record<string, { HostIp?: string; HostPort?: string }[] | null> | null;
    Binds?: string[] | null;
    Mounts?: { Target?: string }[] | null;
    NetworkMode?: string;
  };
  Mounts?: { Type: string; Name?: string; Source?: string; Destination: string; RW: boolean }[];
  NetworkSettings: {
    Ports?: Record<string, { HostIp?: string; HostPort?: string }[] | null>;
    Networks: Record<
      string,
      {
        Aliases?: string[] | null;
        IPAMConfig?: { IPv4Address?: string; IPv6Address?: string } | null;
        NetworkID?: string;
      }
    >;
  };
}

export interface RebindPlan {
  /** Body of `POST /containers/create`, joined to the first network. */
  createBody: Record<string, unknown>;
  /** Networks to connect after creation, with their endpoint settings. */
  extraNetworks: { name: string; endpoint: Record<string, unknown> }[];
}

/** Volume name of a mount: Docker leaves `Name` out for some anonymous volumes, but the path has it. */
const volumeName = (m: { Name?: string; Source?: string }): string | undefined =>
  m.Name ?? m.Source?.match(/\/volumes\/([^/]+)\/_data$/)?.[1];

const key = (p: { containerPort: number; protocol: string }): string =>
  `${p.containerPort}/${p.protocol}`;

/**
 * Builds the request that recreates a container identically except for the host address of some
 * published ports. The host ports stay the same (taken from the live binding when the engine chose
 * them), anonymous volumes are re-attached by name so no data is lost, and the generated hostname is
 * dropped so the new container gets its own.
 */
export const planRebind = (old: InspectedContainer, changes: PortRebind[]): RebindPlan => {
  const bindings = { ...(old.HostConfig.PortBindings ?? {}) };
  for (const change of changes) {
    const k = key(change);
    const configured = bindings[k];
    if (!configured || configured.length === 0)
      throw new Error(`port ${k} is not published by this container`);
    const live = old.NetworkSettings.Ports?.[k]?.[0]?.HostPort;
    const hostPort = configured[0]?.HostPort || live || "";
    bindings[k] = [{ HostIp: change.hostIp, HostPort: hostPort }];
  }

  // A bind with no ":" is an anonymous volume at that path: pin it to the volume it created, or the
  // new container would start with an empty one.
  const volumes = (old.Mounts ?? []).flatMap((m) => {
    const name = m.Type === "volume" ? volumeName(m) : undefined;
    return name ? [{ name, destination: m.Destination, rw: m.RW }] : [];
  });
  const binds = (old.HostConfig.Binds ?? []).map((bind) => {
    const volume = bind.includes(":") ? undefined : volumes.find((v) => v.destination === bind);
    return volume ? `${volume.name}:${volume.destination}${volume.rw ? "" : ":ro"}` : bind;
  });
  const targets = new Set([
    ...binds.map((b) => b.split(":")[1] ?? ""),
    ...(old.HostConfig.Mounts ?? []).map((m) => m.Target ?? ""),
  ]);
  for (const v of volumes)
    if (!targets.has(v.destination)) binds.push(`${v.name}:${v.destination}${v.rw ? "" : ":ro"}`);

  const config = { ...old.Config };
  if (config.Hostname === old.Id.slice(0, 12)) delete config.Hostname;

  const networks = Object.entries(old.NetworkSettings.Networks);
  const primaryName = old.HostConfig.NetworkMode ?? networks[0]?.[0];
  const endpoint = (n: InspectedContainer["NetworkSettings"]["Networks"][string]) => ({
    ...(n.Aliases ? { Aliases: n.Aliases.filter((a) => a !== old.Id.slice(0, 12)) } : {}),
    ...(n.IPAMConfig ? { IPAMConfig: n.IPAMConfig } : {}),
  });
  const primary = networks.find(([name]) => name === primaryName) ?? networks[0];

  return {
    createBody: {
      ...config,
      HostConfig: { ...old.HostConfig, PortBindings: bindings, Binds: binds },
      ...(primary
        ? { NetworkingConfig: { EndpointsConfig: { [primary[0]]: endpoint(primary[1]) } } }
        : {}),
    },
    extraNetworks: networks
      .filter(([name]) => name !== primary?.[0])
      .map(([name, n]) => ({ name, endpoint: endpoint(n) })),
  };
};
