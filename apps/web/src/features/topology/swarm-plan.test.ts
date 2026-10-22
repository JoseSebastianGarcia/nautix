import type { SwarmTask } from "@nautix/contracts";
import { describe, expect, it } from "vitest";
import {
  applyPlan,
  type PlanIo,
  type PlanItem,
  type PlannedCreate,
  planCommand,
  waitConverged,
} from "./swarm-plan.js";

const task = (over: Partial<SwarmTask>): SwarmTask => ({
  id: "t",
  slot: 1,
  nodeId: "n1",
  state: "running",
  desiredState: "running",
  error: "",
  image: "x",
  updatedAt: "",
  ...over,
});

const create = (name: string, replicas = 1): PlannedCreate => ({
  kind: "create",
  key: name,
  spec: { name, image: `${name}:1`, replicas, networks: ["shop"], ports: [] },
  network: "shop",
  droppedVolumes: false,
});

const OPTS = { timeoutMs: 5000, intervalMs: 1000 };

const fakeIo = (over: Partial<PlanIo> = {}) => {
  const calls: string[] = [];
  const io: PlanIo = {
    create: async (s) => {
      calls.push(`create ${s.name}`);
      return `id-${s.name}`;
    },
    scale: async (id, n) => {
      calls.push(`scale ${id} ${n}`);
    },
    remove: async (id) => {
      calls.push(`remove ${id}`);
    },
    tasks: async () => [task({ id: "a" }), task({ id: "b" }), task({ id: "c" })],
    sleep: async () => {},
    ...over,
  };
  return { io, calls };
};

describe("waitConverged", () => {
  it("is done when enough copies run, ignoring the history of replaced tasks", async () => {
    const { io } = fakeIo({
      tasks: async () => [task({ state: "shutdown", desiredState: "shutdown" }), task({ id: "b" })],
    });
    expect(await waitConverged(io, "s", 1, OPTS)).toBeNull();
  });

  it("gives the reason when tasks keep failing", async () => {
    const { io } = fakeIo({
      tasks: async () => [
        task({ id: "a", state: "rejected", error: "No such image: nope" }),
        task({ id: "b", state: "rejected", desiredState: "shutdown" }),
      ],
    });
    expect(await waitConverged(io, "s", 1, OPTS)).toContain("No such image: nope");
  });

  it("times out with what it saw", async () => {
    const { io } = fakeIo({ tasks: async () => [task({ state: "preparing" })] });
    expect(await waitConverged(io, "s", 1, OPTS)).toContain("preparing");
  });

  it("does not wait for zero copies", async () => {
    const { io } = fakeIo({ tasks: async () => [] });
    expect(await waitConverged(io, "s", 0, OPTS)).toBeNull();
  });
});

describe("applyPlan", () => {
  it("applies every change in order", async () => {
    const { io, calls } = fakeIo();
    const items: PlanItem[] = [
      create("api"),
      { kind: "scale", serviceId: "s1", name: "db", from: 1, to: 2 },
    ];
    const r = await applyPlan(items, io, OPTS);
    expect(r.ok).toBe(true);
    expect(calls).toEqual(["create api", "scale s1 2"]);
  });

  it("undoes what was done when a later change fails, and the failing one too", async () => {
    const { io, calls } = fakeIo({
      tasks: async (id) =>
        id === "id-web"
          ? [
              task({ id: "a", state: "rejected", error: "boom" }),
              task({ id: "b", state: "rejected" }),
            ]
          : [task({ id: "a" }), task({ id: "b" }), task({ id: "c" })],
    });
    const items: PlanItem[] = [
      create("api"),
      { kind: "scale", serviceId: "s1", name: "db", from: 1, to: 3 },
      create("web"),
    ];
    const r = await applyPlan(items, io, OPTS);
    expect(r.ok).toBe(false);
    expect(r.failed?.error).toContain("boom");
    expect(calls).toEqual([
      "create api",
      "scale s1 3",
      "create web",
      "remove id-web",
      "scale s1 1",
      "remove id-api",
    ]);
    expect(r.rolledBack).toHaveLength(3);
  });

  it("removes nothing when the create call itself failed", async () => {
    const { io, calls } = fakeIo({
      create: async () => {
        throw new Error("name taken");
      },
    });
    const r = await applyPlan([create("api")], io, OPTS);
    expect(r.failed?.error).toBe("name taken");
    expect(calls).toEqual([]);
  });

  it("reports what could not be undone", async () => {
    const { io } = fakeIo({
      tasks: async () => [task({ state: "rejected" }), task({ id: "b", state: "rejected" })],
      remove: async () => {
        throw new Error("gone");
      },
    });
    const r = await applyPlan([create("api")], io, OPTS);
    expect(r.rollbackErrors[0]?.error).toBe("gone");
  });

  it("scaling down does not wait", async () => {
    const { io, calls } = fakeIo({ tasks: async () => [] });
    const r = await applyPlan(
      [{ kind: "scale", serviceId: "s", name: "x", from: 3, to: 1 }],
      io,
      OPTS,
    );
    expect(r.ok).toBe(true);
    expect(calls).toEqual(["scale s 1"]);
  });
});

describe("planCommand", () => {
  it("shows the docker line without environment values", () => {
    const c = create("api", 3);
    c.spec.ports = [{ target: 80, published: 8080, protocol: "tcp" }];
    c.spec.env = { SECRET: "x" };
    expect(planCommand(c)).toBe(
      "docker service create --name api --replicas 3 --network shop --publish 8080:80 --env SECRET=… api:1",
    );
    expect(planCommand({ kind: "scale", serviceId: "s", name: "db", from: 1, to: 2 })).toBe(
      "docker service scale db=2",
    );
  });
});
