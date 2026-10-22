import { CreateSwarmService } from "@nautix/contracts";
import { describe, expect, it } from "vitest";
import {
  fromNode,
  fromService,
  fromTask,
  patchServiceSpec,
  plainImage,
  stacksOf,
  toServiceSpec,
} from "./swarm-spec.js";

describe("swarm spec", () => {
  it("builds a replicated service spec with ports, env and networks", () => {
    const spec = toServiceSpec(
      CreateSwarmService.parse({
        name: "web",
        image: "nginx:1.27",
        replicas: 3,
        env: { A: "1" },
        ports: [{ target: 80, published: 8080 }],
        networks: ["backend"],
      }),
    );
    expect(spec.Mode).toEqual({ Replicated: { Replicas: 3 } });
    expect(spec.TaskTemplate.ContainerSpec.Env).toEqual(["A=1"]);
    expect(spec.TaskTemplate.Networks).toEqual([{ Target: "backend" }]);
    expect(spec.EndpointSpec?.Ports).toEqual([
      { Protocol: "tcp", TargetPort: 80, PublishedPort: 8080, PublishMode: "ingress" },
    ]);
    expect(spec.Labels?.["nautix.managed"]).toBe("true");
  });

  it("a stateless service updates start-first", () => {
    expect(
      toServiceSpec(CreateSwarmService.parse({ name: "w", image: "x" })).UpdateConfig?.Order,
    ).toBe("start-first");
  });

  it("global services have no replica count", () => {
    const spec = toServiceSpec(
      CreateSwarmService.parse({ name: "agent", image: "x", global: true }),
    );
    expect(spec.Mode).toEqual({ Global: {} });
  });

  it("patches replicas and image without losing the rest", () => {
    const spec = toServiceSpec(
      CreateSwarmService.parse({ name: "web", image: "a:1", env: { K: "v" }, networks: ["n"] }),
    );
    const next = patchServiceSpec(spec, { replicas: 5, image: "a:2" });
    expect(next.Mode).toEqual({ Replicated: { Replicas: 5 } });
    expect(next.TaskTemplate.ContainerSpec).toMatchObject({ Image: "a:2", Env: ["K=v"] });
    expect(next.TaskTemplate.Networks).toEqual([{ Target: "n" }]);
    const global = toServiceSpec(CreateSwarmService.parse({ name: "g", image: "x", global: true }));
    expect(patchServiceSpec(global, { replicas: 2 }).Mode).toEqual({ Global: {} });
  });

  it("maps raw engine rows", () => {
    expect(plainImage("nginx:1@sha256:abc")).toBe("nginx:1");
    const svc = fromService({
      ID: "s1",
      Spec: {
        Name: "web",
        Labels: { "com.docker.stack.namespace": "shop" },
        TaskTemplate: { ContainerSpec: { Image: "nginx@sha256:1" } },
        Mode: { Replicated: { Replicas: 2 } },
      },
      Endpoint: { Ports: [{ Protocol: "tcp", TargetPort: 80, PublishedPort: 8080 }] },
      ServiceStatus: { RunningTasks: 1, DesiredTasks: 2 },
    });
    expect(svc).toMatchObject({
      name: "web",
      image: "nginx",
      replicas: 2,
      running: 1,
      desired: 2,
      stack: "shop",
    });
    expect(svc.ports).toEqual([{ target: 80, published: 8080, protocol: "tcp" }]);
    expect(
      fromNode({
        ID: "n1",
        Spec: { Role: "manager", Availability: "drain" },
        ManagerStatus: { Leader: true },
      }),
    ).toMatchObject({ role: "manager", availability: "drain", leader: true });
    expect(
      fromTask({ ID: "t", DesiredState: "running", Status: { State: "failed", Err: "boom" } }),
    ).toMatchObject({ state: "failed", error: "boom" });
    expect(stacksOf([svc, { ...svc, id: "s2" }, { ...svc, id: "s3", stack: null }])).toEqual([
      { name: "shop", services: 2 },
    ]);
  });

  it("builds volumes, secrets, placement and an update policy that rolls back", () => {
    const spec = toServiceSpec(
      CreateSwarmService.parse({
        name: "db",
        image: "postgres:16",
        mounts: [{ source: "db-data", target: "/var/lib/postgresql/data" }],
        secrets: ["db-password"],
        placement: { role: "worker", nodeId: "n1", maxPerNode: 1 },
      }),
      { "db-password": "sid" },
    );
    expect(spec.TaskTemplate.ContainerSpec.Mounts).toEqual([
      { Type: "volume", Source: "db-data", Target: "/var/lib/postgresql/data", ReadOnly: false },
    ]);
    expect(spec.TaskTemplate.ContainerSpec.Secrets?.[0]).toMatchObject({
      SecretID: "sid",
      SecretName: "db-password",
      File: { Name: "db-password" },
    });
    expect(spec.TaskTemplate.Placement).toEqual({
      Constraints: ["node.role==worker", "node.id==n1"],
      MaxReplicas: 1,
    });
    // A volume and a per-node limit mean the old copy must stop before the new one starts.
    expect(spec.UpdateConfig).toMatchObject({ FailureAction: "rollback", Order: "stop-first" });
    expect(spec.UpdateConfig?.Monitor).toBe(10_000_000_000);
  });

  it("an update keeps what it does not touch and gives the service a rollback policy", () => {
    const spec = toServiceSpec(
      CreateSwarmService.parse({
        name: "db",
        image: "postgres:16",
        env: { A: "1" },
        mounts: [{ source: "d", target: "/d" }],
        placement: { role: "worker" },
      }),
    );
    const { UpdateConfig: _drop, ...bare } = spec;
    const next = patchServiceSpec(
      {
        ...bare,
        TaskTemplate: {
          ...bare.TaskTemplate,
          Placement: { Constraints: ["node.labels.zone==a", "node.role==worker"] },
        },
      },
      { image: "postgres:17", placement: { nodeId: "n2" } },
    );
    expect(next.TaskTemplate.ContainerSpec.Env).toEqual(["A=1"]);
    expect(next.TaskTemplate.ContainerSpec.Mounts).toHaveLength(1);
    // The constraint Nautix does not manage stays; the managed ones are replaced.
    expect(next.TaskTemplate.Placement?.Constraints).toEqual([
      "node.labels.zone==a",
      "node.id==n2",
    ]);
    // Volumes mean two copies cannot share the volume: stop first.
    expect(next.UpdateConfig).toMatchObject({ FailureAction: "rollback", Order: "stop-first" });
  });

  it("an update joins and leaves networks without writing back the ones it did not ask for", () => {
    const spec = toServiceSpec(
      CreateSwarmService.parse({ name: "a", image: "x", networks: ["one", "id-two"] }),
    );
    const next = patchServiceSpec(
      spec,
      { networks: { add: ["three", "one"], remove: ["two"] } },
      { two: "id-two", three: "id-three" },
    );
    // "two" is removed through its id, "one" is not added twice, "three" joins.
    expect(next.TaskTemplate.Networks).toEqual([{ Target: "one" }, { Target: "three" }]);
  });

  it("reads mounts, placement, secrets and the update state back", () => {
    const spec = toServiceSpec(
      CreateSwarmService.parse({
        name: "db",
        image: "postgres:16",
        mounts: [{ source: "d", target: "/d", readOnly: true }],
        secrets: ["s"],
        placement: { role: "manager", maxPerNode: 2 },
      }),
      { s: "sid" },
    );
    const svc = fromService({
      ID: "x",
      Spec: spec,
      UpdateStatus: {
        State: "rollback_completed",
        Message: "update rolled back",
        StartedAt: "2026-01-01T00:00:00Z",
      },
    });
    expect(svc.mounts).toEqual([{ source: "d", target: "/d", readOnly: true }]);
    expect(svc.placement).toEqual({ role: "manager", maxPerNode: 2 });
    expect(svc.secrets).toEqual(["s"]);
    expect(svc.update).toEqual({
      state: "rollback_completed",
      message: "update rolled back",
      startedAt: "2026-01-01T00:00:00Z",
    });
    expect(fromService({ ID: "y", Spec: spec }).update.state).toBeNull();
  });
});
