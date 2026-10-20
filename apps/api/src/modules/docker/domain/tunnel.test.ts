import type { Container, Network } from "@nautix/contracts";
import { describe, expect, it } from "vitest";
import { planTunnel } from "./tunnel.js";

const net = (id: string, name: string, system = false): Network => ({
  id,
  name,
  driver: "bridge",
  internal: true,
  subnet: null,
  containerIds: [],
  system,
});
const ctr = (
  id: string,
  name: string,
  networks: string[],
  labels: Record<string, string> = {},
): Container => ({
  id,
  name,
  image: "x",
  state: "running",
  status: "",
  createdAt: 0,
  ports: [],
  networks,
  labels,
});

const networks = [net("b", "bridge", true), net("a", "front"), net("c", "back")];
const containers = [ctr("db", "postgres", ["back"]), ctr("web", "web", ["front"])];
const request = { fromNetworkId: "a", toNetworkId: "c", targetContainerId: "db", targetPort: 5432 };

describe("planTunnel", () => {
  it("forwards one port from the source network to the target in the destination", () => {
    const { spec, destination } = planTunnel(request, networks, containers);
    expect(spec).toMatchObject({
      name: "tunnel-front-to-back-5432",
      image: "alpine/socat:1.8.1.1",
      networkName: "front",
      cmd: ["TCP-LISTEN:5432,fork,reuseaddr", "TCP:postgres:5432"],
      portBindings: {},
    });
    expect(spec.labels).toMatchObject({
      "nautix.tunnel": "true",
      "nautix.tunnel.target": "postgres:5432",
    });
    expect(destination.name).toBe("back");
  });

  it("can listen on a different port", () => {
    const { spec } = planTunnel({ ...request, listenPort: 15432 }, networks, containers);
    expect(spec.cmd?.[0]).toBe("TCP-LISTEN:15432,fork,reuseaddr");
    expect(spec.name).toBe("tunnel-front-to-back-15432");
  });

  it("refuses system networks, the same network twice, unknown targets and targets elsewhere", () => {
    expect(() => planTunnel({ ...request, fromNetworkId: "b" }, networks, containers)).toThrow();
    expect(() => planTunnel({ ...request, toNetworkId: "a" }, networks, containers)).toThrow();
    expect(() =>
      planTunnel({ ...request, targetContainerId: "nope" }, networks, containers),
    ).toThrow();
    expect(() =>
      planTunnel({ ...request, targetContainerId: "web" }, networks, containers),
    ).toThrow(/not on the destination/);
  });

  it("refuses duplicates and tunnels to tunnels", () => {
    const existing = ctr("t1", "tunnel-front-to-back-5432", ["front", "back"], {
      "nautix.tunnel": "true",
    });
    expect(() => planTunnel(request, networks, [...containers, existing])).toThrow(
      /already exists/,
    );
    expect(() =>
      planTunnel({ ...request, targetContainerId: "t1" }, networks, [...containers, existing]),
    ).toThrow(/tunnel to a tunnel/);
  });
});
