import type { SwarmNode } from "@nautix/contracts";
import { describe, expect, it } from "vitest";
import { scheduleTasks } from "./schedule.js";

const node = (
  id: string,
  role: "manager" | "worker",
  over: Partial<SwarmNode> = {},
): SwarmNode => ({
  id,
  hostname: id,
  role,
  availability: "active",
  state: "ready",
  address: "",
  leader: false,
  engineVersion: "",
  ...over,
});
const nodes = [node("m", "manager"), node("w1", "worker"), node("w2", "worker")];

describe("scheduleTasks", () => {
  it("spreads copies over the nodes", () => {
    expect(scheduleTasks(nodes, {}, "replicated", 3).nodeIds.sort()).toEqual(["m", "w1", "w2"]);
  });

  it("honours the role and the pinned node", () => {
    expect(scheduleTasks(nodes, { role: "worker" }, "replicated", 2).nodeIds.sort()).toEqual([
      "w1",
      "w2",
    ]);
    expect(scheduleTasks(nodes, { nodeId: "w2" }, "replicated", 2).nodeIds).toEqual(["w2", "w2"]);
  });

  it("leaves copies pending beyond the per-node limit, and says why", () => {
    const r = scheduleTasks(nodes, { nodeId: "w1", maxPerNode: 1 }, "replicated", 3);
    expect(r.nodeIds).toEqual(["w1"]);
    expect(r.unplaced).toBe(2);
    expect(r.reason).toContain("max replicas");
  });

  it("skips nodes that are down, paused or draining", () => {
    const some = [
      node("a", "worker", { state: "down" }),
      node("b", "worker", { availability: "drain" }),
      node("c", "worker"),
    ];
    expect(scheduleTasks(some, {}, "replicated", 2).nodeIds).toEqual(["c", "c"]);
    expect(scheduleTasks(some, { role: "manager" }, "replicated", 1).reason).toContain(
      "constraints",
    );
  });

  it("a global service has one copy on every eligible node", () => {
    expect(scheduleTasks(nodes, { role: "worker" }, "global", 0).nodeIds.sort()).toEqual([
      "w1",
      "w2",
    ]);
  });
});
