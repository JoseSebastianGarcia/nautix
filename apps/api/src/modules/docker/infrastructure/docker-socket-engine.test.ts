import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CreateContainer } from "@nautix/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildContainerSpec } from "../domain/container-spec.js";
import { DockerSocketEngine } from "./docker-socket-engine.js";

// A tiny fake daemon speaking the Engine API over a unix socket.
let server: Server;
let dir: string;
let engine: DockerSocketEngine;
const seen: { method: string; url: string; body: string }[] = [];

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "nx-sock-"));
  const socket = join(dir, "docker.sock");
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => {
      body += c;
    });
    req.on("end", () => {
      seen.push({ method: req.method ?? "", url: req.url ?? "", body });
      const url = req.url ?? "";
      const send = (status: number, json: unknown) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(json));
      };
      if (url.startsWith("/v1.43/containers/json"))
        return send(200, [
          {
            Id: "abc",
            Names: ["/web"],
            Image: "nginx",
            ImageID: "sha256:1",
            State: "running",
            Status: "Up",
            Created: 1,
            Ports: [{ IP: "127.0.0.1", PrivatePort: 80, PublicPort: 8080, Type: "tcp" }],
            Labels: null,
            Mounts: [],
            NetworkSettings: { Networks: { edge: {} } },
          },
        ]);
      if (url === "/v1.43/networks")
        return send(200, [
          {
            Id: "n1",
            Name: "edge",
            Driver: "bridge",
            Internal: true,
            IPAM: { Config: [{ Subnet: "10.0.0.0/24" }] },
            Containers: { abc: {} },
          },
          { Id: "n0", Name: "bridge", Driver: "bridge", Internal: false, Containers: {} },
        ]);
      if (url.startsWith("/v1.43/containers/create")) return send(201, { Id: "new" });
      if (url.includes("/containers/missing/"))
        return send(404, { message: "No such container: missing" });
      if (url.includes("/containers/busy/"))
        return send(409, { message: "Bind for 0.0.0.0:80 failed: port is already allocated" });
      res.writeHead(204).end();
    });
  });
  await new Promise<void>((r) => server.listen(socket, r));
  engine = new DockerSocketEngine(socket);
});

afterAll(() => {
  server.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("DockerSocketEngine", () => {
  it("maps containers and networks", async () => {
    const [c] = await engine.listContainers();
    expect(c).toMatchObject({ id: "abc", name: "web", state: "running", networks: ["edge"] });
    const nets = await engine.listNetworks();
    expect(nets[0]).toMatchObject({
      name: "edge",
      internal: true,
      subnet: "10.0.0.0/24",
      containerIds: ["abc"],
      system: false,
    });
    expect(nets[1]?.system).toBe(true);
  });

  it("creates containers with loopback bindings and the target network", async () => {
    const spec = buildContainerSpec(
      CreateContainer.parse({
        name: "x",
        image: "nginx",
        networkId: "n1",
        ports: [{ containerPort: 80, hostPort: 8080 }],
      }),
      "edge",
    );
    await engine.createContainer(spec);
    const call = seen.find((s) => s.url.includes("/containers/create"));
    const body = JSON.parse(call?.body ?? "{}");
    expect(body.HostConfig.PortBindings["80/tcp"][0].HostIp).toBe("127.0.0.1");
    expect(body.HostConfig.NetworkMode).toBe("edge");
  });

  it("maps engine errors to domain errors with hint keys", async () => {
    await expect(engine.containerAction("missing", "start")).rejects.toMatchObject({ status: 404 });
    await expect(engine.containerAction("busy", "start")).rejects.toMatchObject({
      status: 409,
      hintKey: "errors.portInUse",
    });
  });

  it("reports an unreachable daemon as disconnected", async () => {
    const dead = new DockerSocketEngine(join(dir, "nope.sock"));
    expect((await dead.info()).connected).toBe(false);
  });
});
