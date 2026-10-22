import type {
  ClusterTask,
  Network,
  SwarmCluster,
  SwarmNode,
  SwarmService,
} from "@nautix/contracts";
import { describe, expect, it } from "vitest";
import { buildCluster, networkTint, placementState } from "./cluster-model.js";

const node = (id: string, role: "manager" | "worker" = "worker"): SwarmNode => ({
  id,
  hostname: id,
  role,
  availability: "active",
  state: "ready",
  address: "10.0.0.1",
  leader: role === "manager",
  engineVersion: "29",
});
const service = (
  id: string,
  networks: string[],
  desired = 1,
  mode: "replicated" | "global" = "replicated",
): SwarmService => ({
  id,
  name: id,
  image: "x:1",
  mode,
  replicas: mode === "global" ? null : desired,
  running: 0,
  desired,
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
const task = (
  serviceId: string,
  nodeId: string,
  state = "running",
  desiredState = "running",
  slot = 1,
): ClusterTask => ({
  id: `${serviceId}-${nodeId}-${slot}-${state}`,
  slot,
  nodeId,
  state,
  desiredState,
  error: "",
  image: "x:1",
  updatedAt: "",
  serviceId,
});
const net = (id: string, name: string, driver = "overlay", system = false): Network => ({
  id,
  name,
  driver,
  internal: false,
  subnet: null,
  containerIds: [],
  system,
});
const status = {
  active: true,
  nodeId: "m",
  isManager: true,
  managers: 1,
  nodes: 2,
  nodeAddr: null,
  clusterId: "c",
  locked: false,
};

describe("buildCluster", () => {
  const cluster: SwarmCluster = {
    status,
    nodes: [node("w1"), node("m", "manager")],
    services: [service("api", ["net-shop"], 3), service("db", ["shop"], 1), service("tool", [], 1)],
    tasks: [
      task("api", "m", "running", "running", 1),
      task("api", "w1", "failed", "running", 2),
      // history: a replaced copy is not drawn
      task("api", "w1", "shutdown", "shutdown", 2),
      task("db", "m"),
      task("tool", "w1"),
    ],
  };
  const model = buildCluster(cluster, [
    net("net-shop", "shop"),
    net("ing", "ingress", "overlay", true),
    net("br", "bridge", "bridge"),
  ]);

  it("draws one zone per overlay network, matching services by id or by name, and not the system ones", () => {
    expect(model.zones.map((z) => [z.network.name, z.services.map((s) => s.service.name)])).toEqual(
      [["shop", ["api", "db"]]],
    );
    expect(model.loose.map((s) => s.service.name)).toEqual(["tool"]);
  });

  it("counts only the copies the cluster still wants, and says what is missing and how well the service is", () => {
    const api = model.services.find((s) => s.service.name === "api");
    expect(api?.placements.map((p) => [p.task.nodeId, p.state])).toEqual([
      ["m", "ok"],
      ["w1", "bad"],
    ]);
    expect(api?.missing).toBe(1);
    expect(api?.health).toBe("degraded");
    expect(model.services.find((s) => s.service.name === "db")?.health).toBe("ok");
  });

  it("lists the servers with the managers first and the tasks each one holds", () => {
    expect(model.servers.map((s) => s.node.id)).toEqual(["m", "w1"]);
    expect(model.servers[0]?.placements.map((p) => p.service.service.name)).toEqual(["api", "db"]);
    expect(model.servers[1]?.placements.map((p) => p.service.service.name)).toEqual([
      "api",
      "tool",
    ]);
  });

  it("gives an empty cluster an empty drawing", () => {
    const empty = buildCluster({ status, nodes: [], services: [], tasks: [] }, []);
    expect(empty).toMatchObject({ zones: [], loose: [], servers: [], services: [] });
  });
});

describe("copies nobody has taken", () => {
  it("are waiting, not running on an unknown server, and keep Docker's reason", () => {
    const waiting = {
      ...task("api", "", "pending", "running", 2),
      error: "no suitable node (scheduling constraints not satisfied on 1 node)",
    };
    const m = buildCluster(
      {
        status,
        nodes: [node("m", "manager")],
        services: [service("api", ["net-shop"], 2)],
        tasks: [task("api", "m", "running", "running", 1), waiting],
      },
      [net("net-shop", "shop")],
    );
    const api = m.services[0];
    expect(api?.placements).toHaveLength(1);
    expect(api?.missing).toBe(1);
    expect(api?.waitingBecause).toEqual([waiting.error]);
  });
});

describe("placementState and networkTint", () => {
  it("separates running, waiting and broken", () => {
    expect(placementState(task("a", "n", "running"))).toBe("ok");
    expect(placementState(task("a", "n", "pending"))).toBe("pending");
    expect(placementState(task("a", "n", "starting"))).toBe("pending");
    expect(placementState(task("a", "n", "failed"))).toBe("bad");
    expect(placementState(task("a", "n", "rejected"))).toBe("bad");
  });

  it("always tints a network the same way", () => {
    expect(networkTint("shop")).toBe(networkTint("shop"));
    expect(networkTint("shop")).toMatch(/^var\(--nx-/);
  });
});
