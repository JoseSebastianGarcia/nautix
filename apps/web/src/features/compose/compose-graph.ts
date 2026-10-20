import { type ComposeModel, parsePort, type ServiceModel } from "@nautix/compose";
import type { Container, Network } from "@nautix/contracts";
import type { Edge } from "@xyflow/react";

export const DEFAULT_BOX = "default";

export interface ComposeGraph {
  containers: Container[];
  networks: Network[];
  /** `depends_on` relations as flow edges between service nodes. */
  dependencyEdges: Edge[];
}

const svcId = (name: string): string => `svc:${name}`;
export const serviceIdToName = (id: string): string => id.replace(/^svc:/, "");

/** Compose services that bypass the project networks (host/none/bridge/service:x). */
const external = (s: ServiceModel): boolean => s.networkMode !== undefined;

const toContainer = (
  s: ServiceModel,
  states: ReadonlyMap<string, Container["state"]>,
): Container => {
  const networks = external(s) ? [] : s.networks.length > 0 ? s.networks : [DEFAULT_BOX];
  return {
    id: svcId(s.name),
    name: s.name,
    image: s.image ?? (s.hasBuild ? `build: ${s.name}` : ""),
    state: states.get(s.name) ?? "created",
    status: "",
    createdAt: 0,
    labels: {},
    networks,
    ports: s.ports.flatMap((raw) => {
      const spec = parsePort(raw);
      if (!spec) return [];
      const privatePort = Number.parseInt(spec.container, 10);
      const publicPort = spec.host === undefined ? 0 : Number.parseInt(spec.host, 10);
      return [
        {
          ...(spec.ip ? { ip: spec.ip } : {}),
          privatePort,
          // A bare container port still publishes (random host port, all interfaces).
          publicPort: publicPort || privatePort,
          type: spec.protocol,
        },
      ];
    }),
  };
};

/**
 * Maps a Compose model onto the same Container/Network shapes the live canvas uses, so the
 * editor reuses its boxes, nodes and layout. Services that name no network sit in the implicit
 * `default` box, exactly as Compose would place them.
 */
export const buildComposeGraph = (
  model: ComposeModel,
  states: ReadonlyMap<string, Container["state"]> = new Map(),
): ComposeGraph => {
  const containers = model.services.map((s) => toContainer(s, states));
  const declared = new Map(model.networks.map((n) => [n.name, n]));
  const referenced = new Set(containers.flatMap((c) => c.networks));
  const names = [...new Set([...declared.keys(), ...referenced])];
  const networks: Network[] = names.map((name) => ({
    id: name,
    name,
    driver: "bridge",
    internal: declared.get(name)?.internal ?? false,
    subnet: declared.get(name)?.subnet ?? null,
    containerIds: [],
    system: false,
  }));
  const dependencyEdges: Edge[] = model.services.flatMap((s) =>
    s.dependsOn
      .filter((d) => model.services.some((x) => x.name === d))
      .map((d) => ({
        id: `d:${s.name}:${d}`,
        source: svcId(s.name),
        target: svcId(d),
        style: { stroke: "var(--nx-text-dim)" },
        markerEnd: { type: "arrowclosed" as const },
      })),
  );
  return { containers, networks, dependencyEdges };
};
