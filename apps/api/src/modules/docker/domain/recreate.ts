/** What a recreate changes; everything else is carried over from the old container. */
export interface ContainerChange {
  ports?: PortRebind[];
  /** Variable → value to set, or null to remove it. */
  env?: Record<string, string | null>;
  /** Networks (by name) to be on in addition to the ones it already has. */
  joinNetworks?: string[];
}

/** How a recreated container must prove it works before the old one is dropped. */
export interface RecreateGate {
  /** Without a HEALTHCHECK: seconds it must stay up with no restart. */
  settleSeconds: number;
  /** With a HEALTHCHECK: seconds to become healthy. */
  timeoutSeconds: number;
}

export const DEFAULT_GATE: RecreateGate = { settleSeconds: 5, timeoutSeconds: 60 };

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

export interface RecreatePlan {
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

/** `K=V` list with the given variables set or removed; the others keep their order. */
const applyEnv = (current: string[], change: Record<string, string | null>): string[] => [
  ...current.filter((entry) => !((entry.split("=")[0] ?? "") in change)),
  ...Object.entries(change).flatMap(([k, v]) => (v === null ? [] : [`${k}=${v}`])),
];

/**
 * Builds the request that recreates a container identically except for `change`. Host ports stay
 * the same (taken from the live binding when the engine chose them), anonymous volumes are
 * re-attached by name so no data is lost, and the generated hostname is dropped so the new container
 * gets its own.
 */
export const planRecreate = (old: InspectedContainer, change: ContainerChange): RecreatePlan => {
  const portBindings = { ...(old.HostConfig.PortBindings ?? {}) };
  for (const rebind of change.ports ?? []) {
    const k = key(rebind);
    const configured = portBindings[k];
    if (!configured || configured.length === 0)
      throw new Error(`port ${k} is not published by this container`);
    const live = old.NetworkSettings.Ports?.[k]?.[0]?.HostPort;
    const hostPort = configured[0]?.HostPort || live || "";
    portBindings[k] = [{ HostIp: rebind.hostIp, HostPort: hostPort }];
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

  const config: Record<string, unknown> & { Hostname?: string; Env?: string[] | null } = {
    ...old.Config,
  };
  if (config.Hostname === old.Id.slice(0, 12)) delete config.Hostname;
  if (change.env) config.Env = applyEnv(config.Env ?? [], change.env);

  const networks = Object.entries(old.NetworkSettings.Networks);
  const primaryName = old.HostConfig.NetworkMode ?? networks[0]?.[0];
  const endpoint = (n: InspectedContainer["NetworkSettings"]["Networks"][string]) => ({
    ...(n.Aliases ? { Aliases: n.Aliases.filter((a) => a !== old.Id.slice(0, 12)) } : {}),
    ...(n.IPAMConfig ? { IPAMConfig: n.IPAMConfig } : {}),
  });
  const primary = networks.find(([name]) => name === primaryName) ?? networks[0];
  const known = new Set(networks.map(([name]) => name));
  const joined = [...new Set(change.joinNetworks ?? [])]
    .filter((name) => !known.has(name))
    .map((name) => ({ name, endpoint: {} as Record<string, unknown> }));

  return {
    createBody: {
      ...config,
      HostConfig: { ...old.HostConfig, PortBindings: portBindings, Binds: binds },
      ...(primary
        ? { NetworkingConfig: { EndpointsConfig: { [primary[0]]: endpoint(primary[1]) } } }
        : {}),
    },
    extraNetworks: [
      ...networks
        .filter(([name]) => name !== primary?.[0])
        .map(([name, n]) => ({ name, endpoint: endpoint(n) })),
      ...joined,
    ],
  };
};

/** Same as `planRecreate` for a change that only moves published ports to other host addresses. */
export const planRebind = (old: InspectedContainer, changes: PortRebind[]): RecreatePlan =>
  planRecreate(old, { ports: changes });
