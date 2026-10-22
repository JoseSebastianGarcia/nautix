import { CreateSwarmService } from "@nautix/contracts";
import { describe, expect, it } from "vitest";
import {
  fromHealthcheck,
  fromNode,
  fromService,
  fromTask,
  patchEnv,
  patchServiceSpec,
  plainImage,
  rollsOutPatch,
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

  it("sets and unsets environment variables without touching the others", () => {
    expect(patchEnv(["A=1", "B=2", "KEEP=x=y"], { set: { B: "3", C: "4" }, unset: ["A"] })).toEqual(
      ["KEEP=x=y", "B=3", "C=4"],
    );
    expect(patchEnv(undefined, { set: { A: "1" }, unset: [] })).toEqual(["A=1"]);
  });

  it("an environment change is a rolling update with a rollback policy", () => {
    const spec = toServiceSpec(
      CreateSwarmService.parse({ name: "a", image: "x", env: { A: "1" } }),
    );
    const { UpdateConfig: _drop, ...bare } = spec;
    const next = patchServiceSpec(bare, { env: { set: { B: "2" }, unset: [] } });
    expect(next.TaskTemplate.ContainerSpec.Env).toEqual(["A=1", "B=2"]);
    expect(next.UpdateConfig).toMatchObject({ FailureAction: "rollback" });
  });

  it("builds a health check, limits, reservations and configs, and reads them back", () => {
    const spec = toServiceSpec(
      CreateSwarmService.parse({
        name: "api",
        image: "x",
        healthcheck: { command: "curl -f http://localhost/ || exit 1", retries: 5 },
        resources: { cpuLimit: 0.5, memoryLimitMb: 256, memoryReserveMb: 128 },
        configs: ["app.conf"],
      }),
      {},
      { "app.conf": "cid" },
    );
    expect(spec.TaskTemplate.ContainerSpec.Healthcheck).toMatchObject({
      Test: ["CMD-SHELL", "curl -f http://localhost/ || exit 1"],
      Interval: 30_000_000_000,
      Retries: 5,
    });
    expect(spec.TaskTemplate.Resources).toEqual({
      Limits: { NanoCPUs: 500_000_000, MemoryBytes: 256 * 1024 * 1024 },
      Reservations: { MemoryBytes: 128 * 1024 * 1024 },
    });
    expect(spec.TaskTemplate.ContainerSpec.Configs?.[0]).toMatchObject({
      ConfigID: "cid",
      File: { Name: "/app.conf" },
    });
    const svc = fromService({ ID: "x", Spec: spec });
    expect(svc.healthcheck).toMatchObject({
      command: "curl -f http://localhost/ || exit 1",
      retries: 5,
    });
    expect(svc.resources).toEqual({ cpuLimit: 0.5, memoryLimitMb: 256, memoryReserveMb: 128 });
    expect(svc.configs).toEqual(["app.conf"]);
    expect(svc.policy).toMatchObject({
      failureAction: "rollback",
      order: "start-first",
      delaySeconds: 5,
    });
  });

  it("reads Docker's defaults when a service never set a policy, and no health check", () => {
    const spec = toServiceSpec(CreateSwarmService.parse({ name: "a", image: "x" }));
    const { UpdateConfig: _drop, ...bare } = spec;
    const svc = fromService({ ID: "x", Spec: bare });
    expect(svc.policy).toEqual({
      order: "stop-first",
      failureAction: "pause",
      parallelism: 1,
      delaySeconds: 0,
      monitorSeconds: 5,
    });
    expect(svc.healthcheck).toBeNull();
    expect(fromHealthcheck({ Test: ["NONE"] })).toBeNull();
  });

  it("an update edits ports, volumes, secrets, configs, health check and limits in place", () => {
    const spec = toServiceSpec(
      CreateSwarmService.parse({
        name: "a",
        image: "x",
        ports: [{ target: 80, published: 8080 }],
        mounts: [
          { source: "d", target: "/d" },
          { source: "e", target: "/e" },
        ],
        secrets: ["s1", "s2"],
        healthcheck: { command: "true" },
        resources: { memoryLimitMb: 64 },
      }),
      { s1: "i1", s2: "i2" },
    );
    const next = patchServiceSpec(
      spec,
      {
        ports: [{ target: 81, published: 8081, protocol: "tcp" }],
        mounts: { add: [{ source: "f", target: "/f", readOnly: true }], remove: ["/d"] },
        secrets: { add: ["s3"], remove: ["s1"] },
        healthcheck: null,
        resources: {},
      },
      {},
      { secrets: { s3: "i3" }, configs: {} },
    );
    expect(next.EndpointSpec?.Ports).toEqual([
      { Protocol: "tcp", TargetPort: 81, PublishedPort: 8081, PublishMode: "ingress" },
    ]);
    expect(next.TaskTemplate.ContainerSpec.Mounts?.map((m) => m.Target)).toEqual(["/e", "/f"]);
    expect(next.TaskTemplate.ContainerSpec.Secrets?.map((x) => x.SecretName)).toEqual(["s2", "s3"]);
    expect(next.TaskTemplate.ContainerSpec.Healthcheck).toBeUndefined();
    expect(next.TaskTemplate.Resources).toBeUndefined();
  });

  it("a policy change alone replaces the policy and is not a rollout", () => {
    expect(
      rollsOutPatch({
        policy: { failureAction: "pause", parallelism: 2, delaySeconds: 0, monitorSeconds: 5 },
      }),
    ).toBe(false);
    expect(rollsOutPatch({ replicas: 3 })).toBe(false);
    expect(rollsOutPatch({ resources: {} })).toBe(true);
    const spec = toServiceSpec(CreateSwarmService.parse({ name: "a", image: "x" }));
    const next = patchServiceSpec(spec, {
      policy: {
        order: "stop-first",
        failureAction: "pause",
        parallelism: 2,
        delaySeconds: 1,
        monitorSeconds: 2,
      },
    });
    expect(next.UpdateConfig).toMatchObject({
      Parallelism: 2,
      FailureAction: "pause",
      Order: "stop-first",
      Delay: 1_000_000_000,
    });
  });
});
