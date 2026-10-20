import { parse, readCompose } from "@nautix/compose";
import { describe, expect, it } from "vitest";
import { layoutTopology } from "../topology/layout.js";
import { buildComposeGraph } from "./compose-graph.js";

const graph = (yaml: string, states = new Map<string, "running">()) =>
  buildComposeGraph(readCompose(parse(yaml)), states);

describe("buildComposeGraph", () => {
  const yaml = `services:
  proxy:
    image: traefik
    ports: ["127.0.0.1:8080:80", "443:443"]
    networks: [edge, backend]
    depends_on: [api]
  api:
    image: api
  lone:
    image: x
    network_mode: host
networks:
  edge: {}
  backend: { internal: true }
`;

  it("puts services without networks in the implicit default box", () => {
    const g = graph(yaml);
    expect(g.containers.find((c) => c.name === "api")?.networks).toEqual(["default"]);
    expect(g.networks.map((n) => n.name).sort()).toEqual(["backend", "default", "edge"]);
    expect(g.networks.find((n) => n.name === "backend")?.internal).toBe(true);
  });

  it("keeps host-network services outside every box", () => {
    expect(graph(yaml).containers.find((c) => c.name === "lone")?.networks).toEqual([]);
  });

  it("maps ports with their host IP so protection shows on the node", () => {
    const proxy = graph(yaml).containers.find((c) => c.name === "proxy");
    expect(proxy?.ports).toEqual([
      { ip: "127.0.0.1", privatePort: 80, publicPort: 8080, type: "tcp" },
      { privatePort: 443, publicPort: 443, type: "tcp" },
    ]);
  });

  it("creates dependency edges and uses live states", () => {
    const g = graph(yaml, new Map([["api", "running" as const]]));
    expect(g.dependencyEdges.map((e) => e.id)).toEqual(["d:proxy:api"]);
    expect(g.containers.find((c) => c.name === "api")?.state).toBe("running");
  });

  it("lays out with the shared topology engine", () => {
    const g = graph(yaml);
    const t = layoutTopology(g.containers, g.networks);
    expect(t.placements).toHaveLength(3);
    expect(t.links).toEqual([{ containerId: "svc:proxy", zoneId: "backend" }]);
  });
});
