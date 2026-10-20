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

  it("labels containers as managed and keeps the network", () => {
    const spec = buildContainerSpec(
      parse({ name: "db", image: "postgres", networkId: "n1" }),
      "backend",
    );
    expect(spec.labels["nautix.managed"]).toBe("true");
    expect(spec.networkName).toBe("backend");
  });
});
