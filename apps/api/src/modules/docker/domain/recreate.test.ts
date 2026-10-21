import { describe, expect, it } from "vitest";
import { type InspectedContainer, planRebind, planRecreate } from "./recreate.js";

const base = (): InspectedContainer => ({
  Id: "abcdef1234567890",
  Name: "/web",
  Config: { Image: "nginx", Hostname: "abcdef123456", Env: ["A=1"] },
  HostConfig: {
    NetworkMode: "app",
    PortBindings: { "80/tcp": [{ HostIp: "127.0.0.1", HostPort: "" }] },
    Binds: ["/srv/site:/usr/share/nginx/html:ro"],
  },
  Mounts: [
    { Type: "bind", Destination: "/usr/share/nginx/html", RW: false },
    { Type: "volume", Name: "anon123", Destination: "/data", RW: true },
  ],
  NetworkSettings: {
    Ports: { "80/tcp": [{ HostIp: "127.0.0.1", HostPort: "32768" }] },
    Networks: {
      app: { Aliases: ["web", "abcdef123456"], IPAMConfig: { IPv4Address: "172.20.0.5" } },
      db: { Aliases: ["web"] },
    },
  },
});

describe("planRebind", () => {
  it("changes only the host address and keeps the port the engine had chosen", () => {
    const plan = planRebind(base(), [{ containerPort: 80, protocol: "tcp", hostIp: "0.0.0.0" }]);
    const host = plan.createBody.HostConfig as { PortBindings: unknown };
    expect(host.PortBindings).toEqual({ "80/tcp": [{ HostIp: "0.0.0.0", HostPort: "32768" }] });
  });

  it("keeps an explicit host port", () => {
    const old = base();
    old.HostConfig.PortBindings = { "80/tcp": [{ HostIp: "127.0.0.1", HostPort: "8080" }] };
    const plan = planRebind(old, [{ containerPort: 80, protocol: "tcp", hostIp: "10.0.0.2" }]);
    expect((plan.createBody.HostConfig as { PortBindings: unknown }).PortBindings).toEqual({
      "80/tcp": [{ HostIp: "10.0.0.2", HostPort: "8080" }],
    });
  });

  it("re-attaches anonymous volumes and drops the generated hostname", () => {
    const plan = planRebind(base(), [{ containerPort: 80, protocol: "tcp", hostIp: "0.0.0.0" }]);
    expect((plan.createBody.HostConfig as { Binds: string[] }).Binds).toEqual([
      "/srv/site:/usr/share/nginx/html:ro",
      "anon123:/data",
    ]);
    expect(plan.createBody).not.toHaveProperty("Hostname");
    expect((plan.createBody as { Hostname?: string }).Hostname).toBeUndefined();
  });

  it("pins a bare-path anonymous volume to the volume it created, without duplicating it", () => {
    const old = base();
    old.HostConfig.Binds = ["/data"];
    old.Mounts = [{ Type: "volume", Name: "anon123", Destination: "/data", RW: true }];
    const plan = planRebind(old, [{ containerPort: 80, protocol: "tcp", hostIp: "0.0.0.0" }]);
    expect((plan.createBody.HostConfig as { Binds: string[] }).Binds).toEqual(["anon123:/data"]);
  });

  it("finds the volume name in the path when Docker leaves Name out", () => {
    const old = base();
    old.HostConfig.Binds = ["/data"];
    old.Mounts = [
      {
        Type: "volume",
        Source: "/var/lib/docker/volumes/1b6e12/_data",
        Destination: "/data",
        RW: true,
      },
    ];
    const plan = planRebind(old, [{ containerPort: 80, protocol: "tcp", hostIp: "0.0.0.0" }]);
    expect((plan.createBody.HostConfig as { Binds: string[] }).Binds).toEqual(["1b6e12:/data"]);
  });

  it("joins the primary network with its fixed IP and reconnects the rest", () => {
    const plan = planRebind(base(), [{ containerPort: 80, protocol: "tcp", hostIp: "0.0.0.0" }]);
    expect(plan.createBody.NetworkingConfig).toEqual({
      EndpointsConfig: {
        app: { Aliases: ["web"], IPAMConfig: { IPv4Address: "172.20.0.5" } },
      },
    });
    expect(plan.extraNetworks).toEqual([{ name: "db", endpoint: { Aliases: ["web"] } }]);
  });

  it("rejects a port the container does not publish", () => {
    expect(() =>
      planRebind(base(), [{ containerPort: 443, protocol: "tcp", hostIp: "0.0.0.0" }]),
    ).toThrow(/not published/);
  });
});

describe("planRecreate", () => {
  const port = [{ containerPort: 80, protocol: "tcp" as const, hostIp: "127.0.0.1" }];

  it("sets, replaces and removes environment variables and keeps the rest in order", () => {
    const old = base();
    old.Config.Env = ["A=1", "B=2", "KEEP=yes"];
    const plan = planRecreate(old, { env: { B: "two", C: "3", A: null } });
    expect((plan.createBody as { Env: string[] }).Env).toEqual(["KEEP=yes", "B=two", "C=3"]);
  });

  it("leaves the environment alone when the change has none", () => {
    const old = base();
    old.Config.Env = ["A=1"];
    expect((planRecreate(old, { ports: port }).createBody as { Env: string[] }).Env).toEqual([
      "A=1",
    ]);
  });

  it("creates the environment of a container that had none", () => {
    const old = base();
    old.Config.Env = null as never;
    expect((planRecreate(old, { env: { X: "1" } }).createBody as { Env: string[] }).Env).toEqual([
      "X=1",
    ]);
  });

  it("joins extra networks once and ignores the ones it is already on", () => {
    const plan = planRecreate(base(), { joinNetworks: ["data", "data", "app", "db"] });
    expect(plan.extraNetworks.map((n) => n.name)).toEqual(["db", "data"]);
  });

  it("combines ports, env and networks in one recreate", () => {
    const plan = planRecreate(base(), {
      ports: [{ containerPort: 80, protocol: "tcp", hostIp: "0.0.0.0" }],
      env: { MODE: "x" },
      joinNetworks: ["data"],
    });
    const host = plan.createBody.HostConfig as { PortBindings: unknown };
    expect(host.PortBindings).toEqual({ "80/tcp": [{ HostIp: "0.0.0.0", HostPort: "32768" }] });
    expect((plan.createBody as { Env: string[] }).Env).toContain("MODE=x");
    expect(plan.extraNetworks.map((n) => n.name)).toContain("data");
  });
});
