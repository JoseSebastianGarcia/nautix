import type { SwarmService, SwarmTask } from "@nautix/contracts";
import { describe, expect, it } from "vitest";
import {
  applyPlan,
  effectiveNetworks,
  type PlanIo,
  type PlanItem,
  type PlannedCreate,
  planCommands,
  planImage,
  planMove,
  planPlacement,
  planRemove,
  planScale,
  undoPatch,
  updatePatch,
  upsertUpdate,
  waitConverged,
  waitUpdated,
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
const running3 = [task({ id: "a" }), task({ id: "b" }), task({ id: "c" })];

const svc = (update: SwarmService["update"]): SwarmService => ({
  id: "s1",
  name: "db",
  image: "db:1",
  mode: "replicated",
  replicas: 1,
  running: 1,
  desired: 1,
  ports: [],
  stack: null,
  networks: [],
  mounts: [],
  placement: {},
  secrets: [],
  update,
  updatedAt: "",
});
const finished = { state: "completed" as const, message: "", startedAt: "t1" };

const create = (name: string, replicas = 1): PlannedCreate => ({
  kind: "create",
  key: name,
  spec: {
    name,
    image: `${name}:1`,
    replicas,
    networks: ["shop"],
    ports: [],
    mounts: [],
    secrets: [],
  },
  network: "shop",
});

const OPTS = { timeoutMs: 5000, intervalMs: 1000 };

/** A service whose update status changes (new startedAt) every time an update request reaches it. */
const updating = (after: Pick<SwarmService["update"], "state" | "message">) => {
  let n = 0;
  return {
    update: async () => {
      n++;
    },
    service: async () => svc({ ...after, startedAt: `t${n}` }),
  };
};

const fakeIo = (over: Partial<PlanIo> = {}) => {
  const calls: string[] = [];
  const io: PlanIo = {
    create: async (s) => {
      calls.push(`create ${s.name}`);
      return `id-${s.name}`;
    },
    update: async (id, patch) => {
      calls.push(`update ${id} ${JSON.stringify(patch)}`);
    },
    remove: async (id) => {
      calls.push(`remove ${id}`);
    },
    bind: async (input) => {
      calls.push(`bind ${input.consumer}>${input.provider}`);
      return `b-${input.consumer}`;
    },
    unbind: async (id) => {
      calls.push(`unbind ${id}`);
    },
    tasks: async () => running3,
    service: async () => svc(finished),
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

describe("waitUpdated", () => {
  it("ignores the previous update and waits for the new one to complete", async () => {
    const states = [
      finished,
      { state: "updating" as const, message: "", startedAt: "t2" },
      { state: "completed" as const, message: "", startedAt: "t2" },
    ];
    let i = 0;
    const { io } = fakeIo({ service: async () => svc(states[Math.min(i++, 2)] ?? finished) });
    expect(await waitUpdated(io, "s1", "t1", OPTS)).toBeNull();
    expect(i).toBeGreaterThanOrEqual(3);
  });

  it("reports Docker's own reason when the engine rolled the update back", async () => {
    const { io } = fakeIo({
      service: async () =>
        svc({
          state: "rollback_completed",
          message: "update rolled back: No such image",
          startedAt: "t2",
        }),
    });
    expect(await waitUpdated(io, "s1", "t1", OPTS)).toContain("No such image");
  });

  it("times out when no new update ever shows up", async () => {
    const { io } = fakeIo();
    expect(await waitUpdated(io, "s1", "t1", OPTS)).toContain("did not");
  });
});

describe("applyPlan", () => {
  it("applies every change in order, removals last", async () => {
    const calls: string[] = [];
    const st = updating({ state: "completed", message: "" });
    const { io } = fakeIo({
      update: async (id, patch) => {
        calls.push(`update ${id} ${JSON.stringify(patch)}`);
        await st.update();
      },
      service: st.service,
    });
    io.remove = async (id) => {
      calls.push(`remove ${id}`);
    };
    io.create = async (sp) => {
      calls.push(`create ${sp.name}`);
      return `id-${sp.name}`;
    };
    const items: PlanItem[] = [
      { kind: "remove", serviceId: "old", name: "old" },
      create("api"),
      { kind: "scale", serviceId: "s1", name: "db", from: 1, to: 2 },
      {
        kind: "update",
        serviceId: "s1",
        name: "db",
        changes: { image: { from: "db:1", to: "db:2" } },
      },
    ];
    const r = await applyPlan(items, io, OPTS);
    expect(r.ok).toBe(true);
    expect(calls.map((c) => c.split(" ")[0])).toEqual(["create", "update", "update", "remove"]);
    expect(calls.at(-1)).toBe("remove old");
  });

  it("undoes what was done when a later change fails, and the failing one too", async () => {
    const { io, calls } = fakeIo({
      tasks: async (id) =>
        id === "id-web"
          ? [
              task({ id: "a", state: "rejected", error: "boom" }),
              task({ id: "b", state: "rejected" }),
            ]
          : running3,
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
      'update s1 {"replicas":3}',
      "create web",
      "remove id-web",
      'update s1 {"replicas":1}',
      "remove id-api",
    ]);
    expect(r.rolledBack).toHaveLength(3);
  });

  it("an update the engine rolled back fails the plan and puts the previous values back", async () => {
    const calls: string[] = [];
    const st = updating({
      state: "rollback_completed",
      message: "update rolled back: task failed",
    });
    const { io } = fakeIo({
      update: async (id, patch) => {
        calls.push(`update ${id} ${JSON.stringify(patch)}`);
        await st.update();
      },
      service: st.service,
      create: async (sp) => {
        calls.push(`create ${sp.name}`);
        return `id-${sp.name}`;
      },
      remove: async (id) => {
        calls.push(`remove ${id}`);
      },
    });
    const items: PlanItem[] = [
      create("api"),
      {
        kind: "update",
        serviceId: "s1",
        name: "db",
        changes: {
          image: { from: "db:1", to: "db:bad" },
          networks: { add: ["b"], remove: ["a"] },
        },
      },
    ];
    const r = await applyPlan(items, io, OPTS);
    expect(r.failed?.error).toContain("task failed");
    expect(calls).toContain('update s1 {"image":"db:1","networks":{"add":["a"],"remove":["b"]}}');
    expect(calls.at(-1)).toBe("remove id-api");
  });

  it("a failed removal keeps the earlier removals and undoes the rest", async () => {
    const { io, calls } = fakeIo({
      remove: async (id) => {
        calls.push(`remove ${id}`);
        if (id === "two") throw new Error("busy");
      },
    });
    const items: PlanItem[] = [
      { kind: "scale", serviceId: "s1", name: "db", from: 1, to: 2 },
      { kind: "remove", serviceId: "one", name: "one" },
      { kind: "remove", serviceId: "two", name: "two" },
    ];
    const r = await applyPlan(items, io, OPTS);
    expect(r.failed?.error).toBe("busy");
    expect(r.removed.map((i) => (i.kind === "remove" ? i.name : ""))).toEqual(["one"]);
    expect(calls.at(-1)).toBe('update s1 {"replicas":1}');
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
    expect(calls).toEqual(['update s {"replicas":1}']);
  });
});

describe("bindings in the plan", () => {
  const bind: PlanItem = {
    kind: "bind",
    key: "web>db:db",
    consumer: { id: "w", name: "web" },
    provider: { id: "d", name: "db" },
    name: "db",
    style: "dotnet",
    variables: ["ConnectionStrings__db"],
    network: "shop",
    joins: true,
  };
  const unbind: PlanItem = {
    kind: "unbind",
    bindingId: "b1",
    consumer: { id: "w", name: "web" },
    provider: "db",
    name: "db",
    style: "dotnet",
    variables: ["ConnectionStrings__db"],
  };

  it("applies a binding and waits for the consumer's update", async () => {
    const calls: string[] = [];
    const st = updating({ state: "completed", message: "" });
    const { io } = fakeIo({
      service: st.service,
      bind: async (i) => {
        calls.push(`bind ${i.consumer}>${i.provider}`);
        await st.update();
        return "new-id";
      },
    });
    const r = await applyPlan([bind], io, OPTS);
    expect(r.ok).toBe(true);
    expect(calls).toEqual(["bind web>db"]);
  });

  it("undoes a binding that was made when the plan fails later, and re-creates one that was removed", async () => {
    const calls: string[] = [];
    const st = updating({ state: "completed", message: "" });
    const { io } = fakeIo({
      service: st.service,
      bind: async (i) => {
        calls.push(`bind ${i.consumer}>${i.provider}`);
        await st.update();
        return "new-id";
      },
      unbind: async (id) => {
        calls.push(`unbind ${id}`);
        await st.update();
      },
      create: async () => {
        throw new Error("name taken");
      },
    });
    const r = await applyPlan([unbind, bind, create("x")], io, OPTS);
    expect(r.ok).toBe(false);
    // Undone in reverse: the new binding goes, the removed one comes back.
    expect(calls).toEqual(["unbind b1", "bind web>db", "unbind new-id", "bind web>db"]);
  });

  it("shows the docker lines for both", () => {
    expect(planCommands(bind)).toEqual([
      "docker service update --network-add shop --env-add ConnectionStrings__db=… web",
    ]);
    expect(planCommands(unbind)).toEqual([
      "docker service update --env-rm ConnectionStrings__db web",
    ]);
  });
});

describe("patches and commands", () => {
  it("builds the request and its inverse", () => {
    const c = {
      image: { from: "a:1", to: "a:2" },
      placement: { from: { role: "worker" as const }, to: { nodeId: "n1" } },
      networks: { add: ["x"], remove: ["y"] },
    };
    expect(updatePatch(c)).toEqual({
      image: "a:2",
      placement: { nodeId: "n1" },
      networks: { add: ["x"], remove: ["y"] },
    });
    expect(undoPatch(c)).toEqual({
      image: "a:1",
      placement: { role: "worker" },
      networks: { add: ["y"], remove: ["x"] },
    });
  });

  it("shows the docker lines without environment values", () => {
    const c = create("api", 3);
    c.spec.ports = [{ target: 80, published: 8080, protocol: "tcp" }];
    c.spec.env = { SECRET: "x" };
    c.spec.mounts = [{ source: "api-data", target: "/data", readOnly: false }];
    c.spec.secrets = ["db-pass"];
    c.spec.placement = { role: "worker", maxPerNode: 1 };
    expect(planCommands(c)).toEqual([
      "docker service create --name api --replicas 3 --network shop --mount type=volume,source=api-data,target=/data --secret db-pass --constraint 'node.role==worker' --replicas-max-per-node 1 --publish 8080:80 --env SECRET=… api:1",
    ]);
    expect(planCommands({ kind: "scale", serviceId: "s", name: "db", from: 1, to: 2 })).toEqual([
      "docker service scale db=2",
    ]);
    expect(planCommands({ kind: "remove", serviceId: "s", name: "db" })).toEqual([
      "docker service rm db",
    ]);
    expect(
      planCommands({
        kind: "update",
        serviceId: "s",
        name: "db",
        changes: {
          image: { from: "a", to: "b" },
          networks: { add: ["n2"], remove: ["n1"] },
          placement: { from: { role: "worker" }, to: { nodeId: "z" } },
        },
      }),
    ).toEqual([
      "docker service update --image b db",
      "docker service update --network-add n2 --network-rm n1 db",
      "docker service update --constraint-rm 'node.role==worker' --constraint-add 'node.id==z' db",
    ]);
  });
});

describe("building the plan", () => {
  const db = { id: "s1", name: "db" };

  it("merges changes of one service into one update and drops it when nothing is left", () => {
    let plan = upsertUpdate([], db, planImage("db:1", "db:2"));
    plan = upsertUpdate(plan, db, planPlacement({}, { nodeId: "n1" }));
    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({
      kind: "update",
      changes: { image: { from: "db:1", to: "db:2" }, placement: { to: { nodeId: "n1" } } },
    });
    plan = upsertUpdate(plan, db, planImage("db:1", "db:1"));
    plan = upsertUpdate(plan, db, planPlacement({}, {}));
    expect(plan).toEqual([]);
  });

  it("moving a service back to where it was cancels the move", () => {
    let plan = upsertUpdate([], db, planMove("shop", "public"));
    expect(effectiveNetworks(["shop"], plan, "s1")).toEqual(["public"]);
    plan = upsertUpdate(plan, db, planMove("public", "shop"));
    expect(plan).toEqual([]);
    expect(effectiveNetworks(["shop"], plan, "s1")).toEqual(["shop"]);
  });

  it("moving out of no overlay only joins, and into no overlay only leaves", () => {
    expect(upsertUpdate([], db, planMove(null, "shop"))[0]).toMatchObject({
      changes: { networks: { add: ["shop"], remove: [] } },
    });
    expect(upsertUpdate([], db, planMove("shop", null))[0]).toMatchObject({
      changes: { networks: { add: [], remove: ["shop"] } },
    });
  });

  it("scaling back to the current count removes the change", () => {
    const svc = { ...db, desired: 2 };
    expect(planScale([], svc, 3)).toHaveLength(1);
    expect(planScale(planScale([], svc, 3), svc, 2)).toEqual([]);
  });

  it("removing a service replaces whatever else was planned for it", () => {
    const plan = planRemove(planScale([], { ...db, desired: 1 }, 2), db);
    expect(plan).toEqual([{ kind: "remove", serviceId: "s1", name: "db" }]);
  });
});
