import type { Container, ContainerDetails, Network } from "@nautix/contracts";
import { describe, expect, it } from "vitest";
import { toCompose } from "./compose-export.js";

const net = (name: string, over: Partial<Network> = {}): Network => ({
  id: name,
  name,
  driver: "bridge",
  internal: false,
  subnet: null,
  containerIds: [],
  system: false,
  ...over,
});
const container = (over: Partial<Container>): Container => ({
  id: "c",
  name: "c",
  image: "img",
  state: "running",
  status: "Up",
  createdAt: 0,
  ports: [],
  networks: [],
  labels: {},
  ...over,
});
const detail = (id: string, over: Partial<ContainerDetails> = {}): ContainerDetails => ({
  id,
  name: id,
  image: "img",
  env: {},
  command: null,
  restartPolicy: "no",
  mounts: [],
  ...over,
});

const networks = [
  net("bridge", { system: true }),
  net("backend", { internal: true, subnet: "10.9.0.0/24" }),
];

describe("toCompose", () => {
  it("maps boxes to networks and keeps loopback port bindings", () => {
    const doc = toCompose({
      containers: [
        container({
          id: "p",
          name: "proxy",
          image: "traefik:v3.1",
          networks: ["backend"],
          ports: [{ ip: "127.0.0.1", privatePort: 80, publicPort: 8080, type: "tcp" }],
        }),
      ],
      details: [detail("p", { restartPolicy: "unless-stopped" })],
      networks,
      includeEnv: false,
    });
    expect(doc.services.proxy).toMatchObject({
      image: "traefik:v3.1",
      restart: "unless-stopped",
      ports: ["127.0.0.1:8080:80"],
      networks: ["backend"],
    });
    expect(doc.networks).toEqual({
      backend: { internal: true, ipam: { config: [{ subnet: "10.9.0.0/24" }] } },
    });
  });

  it("keeps containers outside every box on the default bridge", () => {
    const doc = toCompose({
      containers: [container({ id: "a", name: "lone", networks: ["bridge"] })],
      details: [],
      networks,
      includeEnv: false,
    });
    expect(doc.services.lone?.network_mode).toBe("bridge");
    expect(doc.networks).toBeUndefined();
  });

  it("does not leak env values unless asked", () => {
    const input = {
      containers: [container({ id: "d", name: "db" })],
      details: [detail("d", { env: { POSTGRES_PASSWORD: "s3cret" } })],
      networks,
    };
    expect(toCompose({ ...input, includeEnv: false }).services.db?.environment).toEqual({
      POSTGRES_PASSWORD: "${POSTGRES_PASSWORD}",
    });
    expect(toCompose({ ...input, includeEnv: true }).services.db?.environment).toEqual({
      POSTGRES_PASSWORD: "s3cret",
    });
  });

  it("declares named volumes and keeps bind mounts", () => {
    const doc = toCompose({
      containers: [container({ id: "d", name: "db" })],
      details: [
        detail("d", {
          mounts: [
            {
              type: "volume",
              source: "pgdata",
              target: "/var/lib/postgresql/data",
              readOnly: false,
            },
            { type: "bind", source: "/srv/conf", target: "/etc/conf", readOnly: true },
          ],
        }),
      ],
      networks,
      includeEnv: false,
    });
    expect(doc.services.db?.volumes).toEqual([
      "pgdata:/var/lib/postgresql/data",
      "/srv/conf:/etc/conf:ro",
    ]);
    expect(doc.volumes).toEqual({ pgdata: {} });
  });
});
