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
});
