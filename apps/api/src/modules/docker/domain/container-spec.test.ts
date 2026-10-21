import { CreateContainer } from "@nautix/contracts";
import { describe, expect, it } from "vitest";
import { buildContainerSpec } from "./container-spec.js";

const parse = (input: unknown) => CreateContainer.parse(input);

describe("buildContainerSpec", () => {
  it("binds published ports to loopback by default", () => {
    const spec = buildContainerSpec(
      parse({
        name: "web",
        image: "nginx",
        networkId: null,
        ports: [{ containerPort: 80, hostPort: 8080 }],
      }),
      undefined,
    );
    expect(spec.portBindings["80/tcp"]).toEqual([{ HostIp: "127.0.0.1", HostPort: "8080" }]);
  });

  it("translates healthcheck and limits to engine units", () => {
    const spec = buildContainerSpec(
      parse({
        name: "api",
        image: "app",
        networkId: null,
        healthcheck: { command: "curl -f http://localhost/ || exit 1", intervalSeconds: 10 },
        limits: { memoryMb: 256, cpus: 0.5 },
      }),
      undefined,
    );
    expect(spec.healthcheck).toEqual({
      test: ["CMD-SHELL", "curl -f http://localhost/ || exit 1"],
      intervalNs: 10_000_000_000,
      timeoutNs: 5_000_000_000,
      retries: 3,
      startPeriodNs: 0,
    });
    expect(spec.memoryBytes).toBe(256 * 1024 * 1024);
    expect(spec.nanoCpus).toBe(500_000_000);
    expect(
      buildContainerSpec(parse({ name: "a", image: "b", networkId: null }), undefined),
    ).not.toHaveProperty("healthcheck");
  });

  it("only binds publicly on explicit consent", () => {
    const spec = buildContainerSpec(
      parse({
        name: "web",
        image: "nginx",
        networkId: null,
        ports: [{ containerPort: 80, exposePublicly: true }],
      }),
      undefined,
    );
    expect(spec.portBindings["80/tcp"]?.[0]?.HostIp).toBe("0.0.0.0");
  });

  it("binds to a chosen host address, which wins over exposePublicly", () => {
    const spec = buildContainerSpec(
      parse({
        name: "db",
        image: "postgres",
        networkId: null,
        ports: [{ containerPort: 5432, bindAddress: "10.0.0.2", exposePublicly: true }],
      }),
      undefined,
    );
    expect(spec.portBindings["5432/tcp"]?.[0]?.HostIp).toBe("10.0.0.2");
    expect(
      CreateContainer.safeParse({
        name: "db",
        image: "postgres",
        networkId: null,
        ports: [{ containerPort: 5432, bindAddress: "not-an-ip" }],
      }).success,
    ).toBe(false);
  });

  it("labels containers as managed and keeps the network", () => {
    const spec = buildContainerSpec(
      parse({ name: "db", image: "postgres", networkId: "n1" }),
      "backend",
    );
    expect(spec.labels["nautix.managed"]).toBe("true");
    expect(spec.networkName).toBe("backend");
  });

  it("keeps unless-stopped by default and honours an explicit policy", () => {
    const base = { name: "x", image: "hello-world", networkId: null };
    expect(buildContainerSpec(parse(base), undefined).restartPolicy).toBe("unless-stopped");
    expect(
      buildContainerSpec(parse({ ...base, restartPolicy: "no" }), undefined).restartPolicy,
    ).toBe("no");
    expect(() => parse({ ...base, restartPolicy: "forever" })).toThrow();
  });

  it("publishes UDP ports under their own key, alongside TCP on the same number", () => {
    const spec = buildContainerSpec(
      parse({
        name: "dns",
        image: "x",
        networkId: null,
        ports: [
          { containerPort: 53, protocol: "udp", hostPort: 53 },
          { containerPort: 53, hostPort: 53 },
        ],
      }),
      undefined,
    );
    expect(Object.keys(spec.portBindings).sort()).toEqual(["53/tcp", "53/udp"]);
    expect(spec.portBindings["53/udp"]?.[0]).toEqual({ HostIp: "127.0.0.1", HostPort: "53" });
  });
});
