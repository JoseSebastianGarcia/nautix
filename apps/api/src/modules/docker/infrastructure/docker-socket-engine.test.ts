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
      if (url === "/v1.43/containers/abc/json")
        return send(200, {
          Id: "abc",
          Name: "/web",
          Config: { Image: "nginx", Env: ["PATH=/bin", "APP_KEY=1"], Cmd: ["nginx"] },
          HostConfig: { RestartPolicy: { Name: "always" } },
          Mounts: [
            { Type: "volume", Name: "data", Source: "/var/lib/x", Destination: "/data", RW: true },
          ],
        });
      if (url === "/v1.43/images/nginx/json")
        return send(200, { Config: { Env: ["PATH=/bin"], Cmd: ["nginx"] } });
      if (url.startsWith("/v1.43/images/myorg/web:v1/history"))
        return send(200, [
          { Id: "sha256:a", Created: 5, CreatedBy: "CMD x", Size: 10, Tags: null },
        ]);
      if (url.startsWith("/v1.43/images/search"))
        return send(200, [{ name: "nginx", description: "d", star_count: 7, is_official: true }]);
      if (url.startsWith("/v1.43/images/private/app/push")) {
        res.writeHead(200);
        return res.end(
          '{"status":"The push refers to repository"}\n{"error":"denied: wrong-secret rejected"}\n',
        );
      }
      if (url.startsWith("/v1.43/containers/prune"))
        return send(200, { ContainersDeleted: ["a", "b"], SpaceReclaimed: 42 });
      if (url.startsWith("/v1.43/images/prune"))
        return send(200, { ImagesDeleted: null, SpaceReclaimed: 0 });
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

  it("inspects only what the user configured (image defaults removed)", async () => {
    const [d] = await engine.inspectContainers(["abc"]);
    expect(d).toMatchObject({
      name: "web",
      env: { APP_KEY: "1" },
      command: null,
      restartPolicy: "always",
      mounts: [{ type: "volume", source: "data", target: "/data", readOnly: false }],
    });
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
    expect(body.HostConfig.RestartPolicy).toEqual({ Name: "unless-stopped" });
  });

  it("maps image history, search and prune results", async () => {
    expect(await engine.imageHistory("myorg/web:v1")).toEqual([
      { id: "sha256:a", createdAt: 5, createdBy: "CMD x", size: 10, tags: [] },
    ]);
    expect(await engine.searchImages("nginx", 5)).toEqual([
      { name: "nginx", description: "d", stars: 7, official: true },
    ]);
    expect(await engine.prune("containers", false)).toEqual({ deleted: 2, reclaimedBytes: 42 });
    expect(await engine.prune("images", true)).toEqual({ deleted: 0, reclaimedBytes: 0 });
    expect(
      seen.some(
        (r) =>
          r.url.includes("/images/prune") &&
          r.url.includes(encodeURIComponent('"dangling":["false"]')),
      ),
    ).toBe(true);
  });

  it("sends push credentials once in the auth header and never echoes the password back", async () => {
    await expect(
      engine.pushImage("private/app:1", { username: "u", password: "wrong-secret" }),
    ).rejects.toMatchObject({
      message: expect.not.stringContaining("wrong-secret"),
    });
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
