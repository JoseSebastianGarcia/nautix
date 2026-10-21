import {
  type Binding,
  exposureOf,
  type ServicePort,
  type ServiceSpec,
  type ZoneSpec,
} from "@nautix/contracts";

/** A container on the zone, as Nautix reads it from the engine. */
export interface ZoneContainer {
  name: string;
  image: string;
  /** Explicitly configured environment (image defaults left out). */
  env: Record<string, string>;
  command: string[] | null;
  restartPolicy: string;
  /** `name:/path[:ro]`, `/host:/path[:ro]` or a bare `/path` for an anonymous volume. */
  volumes: string[];
  ports: { privatePort: number; type: string; publicPort?: number; ip?: string }[];
}

/** Everything the planner needs to know about reality. */
export interface ZoneFacts {
  /** The network, or null when it does not exist yet. */
  network: { name: string; internal: boolean } | null;
  /** Containers on that network (Nautix itself and tunnels already left out). */
  containers: ZoneContainer[];
  /** Names of containers that exist on the engine but not on this zone. */
  outside: string[];
  bindings: Binding[];
}

/** Docker names anonymous volumes with 64 hex characters. */
const ANONYMOUS = /^[0-9a-f]{64}$/;

/** A mount as a `-v` string: an anonymous volume is just its path, as it was written. */
export const volumeString = (m: {
  type: string;
  source: string;
  target: string;
  readOnly: boolean;
}): string | null => {
  if (m.type === "tmpfs") return null;
  if (m.type === "volume" && ANONYMOUS.test(m.source)) return m.target;
  return `${m.source}:${m.target}${m.readOnly ? ":ro" : ""}`;
};

const portsOf = (c: ZoneContainer): ServicePort[] => {
  const seen = new Set<string>();
  const out: ServicePort[] = [];
  for (const p of c.ports) {
    if (p.publicPort === undefined) continue;
    const protocol = p.type === "udp" ? "udp" : "tcp";
    const key = `${p.privatePort}/${protocol}`;
    if (seen.has(key)) continue; // the same port bound on IPv4 and IPv6
    seen.add(key);
    const exposure = exposureOf(p.ip);
    out.push({
      container: p.privatePort,
      protocol,
      host: p.publicPort,
      expose: exposure.kind === "address" ? exposure.address : exposure.kind,
    });
  }
  return out.sort((a, b) => a.container - b.container);
};

const RESTART = new Set(["no", "unless-stopped", "always", "on-failure"]);

/** The zone as a document, from what is running. Variables a binding wrote are shown as the binding. */
export const describeZone = (name: string, facts: ZoneFacts): ZoneSpec => {
  const services: Record<string, ServiceSpec> = {};
  for (const c of facts.containers) {
    const mine = facts.bindings.filter((b) => b.consumer === c.name);
    const derived = new Set(mine.flatMap((b) => b.variables));
    services[c.name] = {
      image: c.image,
      env: Object.fromEntries(Object.entries(c.env).filter(([k]) => !derived.has(k))),
      ports: portsOf(c),
      volumes: [...c.volumes].sort(),
      ...(c.command ? { command: c.command } : {}),
      restart: (RESTART.has(c.restartPolicy) ? c.restartPolicy : "no") as ServiceSpec["restart"],
      bindings: mine
        .filter((b) => facts.containers.some((p) => p.name === b.provider))
        .map((b) => ({ to: b.provider, name: b.name, style: b.style })),
    };
  }
  return {
    version: 1,
    zone: { name, internal: facts.network?.internal ?? false },
    services,
  };
};
