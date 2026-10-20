import type { Container, Network } from "@nautix/contracts";
import { describe, expect, it } from "vitest";
import { planMove } from "./move-plan.js";

const net = (id: string, name: string, system = false): Network => ({
  id,
  name,
  driver: "bridge",
  internal: false,
  subnet: null,
  containerIds: [],
  system,
});
const container = (networks: string[]): Container => ({
  id: "c",
  name: "c",
  image: "i",
  state: "running",
  status: "",
  createdAt: 0,
  ports: [],
  networks,
  labels: {},
});

const bridge = net("b", "bridge", true);
const edge = net("e", "edge");
const back = net("k", "backend");
const all = [bridge, edge, back];

describe("planMove", () => {
  it("connects the target before leaving the source", () => {
    const steps = planMove(container(["edge"]), all, edge, back);
    expect(steps.map((s) => `${s.op}:${s.networkName}`)).toEqual([
      "connect:backend",
      "disconnect:edge",
    ]);
  });

  it("leaves the default bridge when entering a network box", () => {
    const steps = planMove(container(["bridge"]), all, null, edge);
    expect(steps.map((s) => `${s.op}:${s.networkName}`)).toEqual([
      "connect:edge",
      "disconnect:bridge",
    ]);
  });

  it("goes back to the bridge when moved outside", () => {
    const steps = planMove(container(["edge"]), all, edge, null);
    expect(steps.map((s) => `${s.op}:${s.networkName}`)).toEqual([
      "connect:bridge",
      "disconnect:edge",
    ]);
  });
});
