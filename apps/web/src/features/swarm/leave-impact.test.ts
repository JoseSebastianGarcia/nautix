import type { Network, SwarmCluster, SwarmService } from "@nautix/contracts";
import { describe, expect, it } from "vitest";
import { leaveImpact } from "./leave-impact.js";

const status = (over: Partial<SwarmCluster["status"]> = {}): SwarmCluster["status"] => ({
  active: true,
  nodeId: "n",
  isManager: true,
  managers: 1,
  nodes: 1,
  nodeAddr: null,
  clusterId: "c",
  locked: false,
  ...over,
});
const svc = (name: string, networks: string[]): SwarmService => ({
  id: name,
  name,
  image: "x",
  mode: "replicated",
  replicas: 1,
  running: 1,
  desired: 1,
  ports: [],
  stack: null,
  networks,
  mounts: [],
  placement: {},
  secrets: [],
  configs: [],
  healthcheck: null,
  resources: {},
  policy: {
    order: "stop-first",
    failureAction: "pause",
    parallelism: 1,
    delaySeconds: 0,
    monitorSeconds: 5,
  },
  update: { state: null, message: "", startedAt: "" },
  updatedAt: "",
});
const overlay = (name: string): Network => ({
  id: `id-${name}`,
  name,
  driver: "overlay",
  internal: false,
  subnet: null,
  containerIds: [],
  system: false,
});

describe("leaveImpact", () => {
  it("names the overlay zones and services that lose their cluster, and flags the last manager", () => {
    const cluster: SwarmCluster = {
      status: status(),
      nodes: [],
      services: [svc("b", ["shop"]), svc("a", ["edge"]), svc("c", [])],
      tasks: [],
    };
    expect(leaveImpact(cluster, [overlay("shop"), overlay("edge"), overlay("unused")])).toEqual({
      zones: ["edge", "shop"],
      services: ["a", "b", "c"],
      lastManager: true,
      known: true,
    });
  });

  it("is not the last manager when others remain", () => {
    const impact = leaveImpact(
      { status: status({ managers: 3 }), nodes: [], services: [], tasks: [] },
      [],
    );
    expect(impact.lastManager).toBe(false);
  });

  it("knows nothing from a worker or a locked swarm", () => {
    for (const s of [status({ isManager: false }), status({ locked: true })])
      expect(leaveImpact({ status: s, nodes: [], services: [], tasks: [] }, [])).toEqual({
        zones: [],
        services: [],
        lastManager: false,
        known: false,
      });
  });
});
