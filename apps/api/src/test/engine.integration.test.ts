import "reflect-metadata";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AppModule } from "../app.module.js";
import type { AppConfig } from "../shared/config.js";
import { ProblemFilter } from "../shared/problem.filter.js";

/**
 * Runs the real API against a real Docker daemon (`NAUTIX_DOCKER_SOCKET`, default
 * /var/run/docker.sock). Everything it creates is prefixed `nxit-` and removed afterwards.
 */
const PREFIX = "nxit-";
const IMAGE = "alpine:3.20";
const SOCAT = "alpine/socat:1.8.1.1";

let app: INestApplication;
let base: string;
let dataDir: string;
let cookie = "";

const docker = (...args: string[]): string =>
  execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

const call = async (method: string, path: string, body?: unknown) => {
  const res = await fetch(`${base}/api/v1${path}`, {
    method,
    headers: {
      "x-nautix-csrf": "1",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(cookie ? { cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const json = res.headers.get("content-type")?.includes("json") ? await res.json() : undefined;
  return { res, json };
};

const cleanup = (): void => {
  const names = docker("ps", "-a", "--format", "{{.Names}}", "--filter", `name=${PREFIX}`)
    .split("\n")
    .filter((n) => n !== "");
  if (names.length) docker("rm", "-f", ...names);
  for (const n of docker("network", "ls", "--format", "{{.Name}}", "--filter", `name=${PREFIX}`)
    .split("\n")
    .filter((n) => n !== ""))
    docker("network", "rm", n);
};

beforeAll(async () => {
  for (const image of [IMAGE, SOCAT]) {
    try {
      docker("image", "inspect", image);
    } catch {
      docker("pull", image);
    }
  }
  cleanup();
  dataDir = mkdtempSync(join(tmpdir(), "nautix-it-"));
  const config: AppConfig = {
    host: "127.0.0.1",
    port: 0,
    dataDir,
    engine: "socket",
    dockerSocket: process.env.NAUTIX_DOCKER_SOCKET ?? "/var/run/docker.sock",
    webDist: "",
    secureCookies: false,
    tls: { mode: "off" },
  };
  const logs: string[] = [];
  vi.spyOn(console, "log").mockImplementation((m: string) => logs.push(String(m)));
  app = await NestFactory.create(AppModule.register(config), { logger: false });
  app.use(cookieParser());
  app.useGlobalFilters(new ProblemFilter());
  await app.listen(0, "127.0.0.1");
  base = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}`;
  const setupToken = logs.join("\n").match(/\(one-time\): (\S+)/)?.[1] ?? "";
  await call("POST", "/auth/setup", { setupToken, username: "admin", password: "correct-horse-1" });
  const login = await call("POST", "/auth/login", {
    username: "admin",
    password: "correct-horse-1",
  });
  cookie = (login.res.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
});

afterAll(async () => {
  await app?.close();
  cleanup();
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
});

type Net = { id: string; name: string };
type Ctr = {
  id: string;
  name: string;
  state: string;
  networks: string[];
  labels: Record<string, string>;
};

describe("against a real Docker daemon", () => {
  it("reports the engine", async () => {
    const { res, json } = await call("GET", "/engine");
    expect(res.status).toBe(200);
    expect(json.version).toMatch(/^\d+\./);
  });

  it("creates networks, runs containers inside them and controls their lifecycle", async () => {
    expect(
      (await call("POST", "/networks", { name: `${PREFIX}a`, internal: true })).res.status,
    ).toBe(201);
    const nets = (await call("GET", "/networks")).json as Net[];
    const a = nets.find((n) => n.name === `${PREFIX}a`);
    expect(a).toBeDefined();

    const created = await call("POST", "/containers", {
      name: `${PREFIX}web`,
      image: IMAGE,
      networkId: a?.id,
      restartPolicy: "no",
      env: { GREETING: "hola" },
      command: ["sh", "-c", 'echo "$GREETING mundo"; sleep 300'],
    });
    expect(created.res.status).toBe(201);

    const list = (await call("GET", "/containers")).json as Ctr[];
    const web = list.find((c) => c.name === `${PREFIX}web`);
    expect(web?.state).toBe("running");
    expect(web?.networks).toEqual([`${PREFIX}a`]);

    await new Promise((r) => setTimeout(r, 500));
    const logs = (await call("GET", `/containers/${web?.id}/logs?tail=10`)).json.logs as string;
    expect(logs).toContain("hola mundo");

    expect((await call("POST", `/containers/${web?.id}/stop`)).res.status).toBe(204);
    expect(
      ((await call("GET", "/containers")).json as Ctr[]).find((c) => c.id === web?.id)?.state,
    ).toBe("exited");
    expect((await call("POST", `/containers/${web?.id}/start`)).res.status).toBe(204);
    expect(
      ((await call("GET", "/containers")).json as Ctr[]).find((c) => c.id === web?.id)?.state,
    ).toBe("running");
  });

  it("limits logs to a time window", async () => {
    const web = ((await call("GET", "/containers")).json as Ctr[]).find(
      (c) => c.name === `${PREFIX}web`,
    );
    await new Promise((r) => setTimeout(r, 2500));
    const recent = (await call("GET", `/containers/${web?.id}/logs?tail=50&since=1`)).json
      .logs as string;
    const all = (await call("GET", `/containers/${web?.id}/logs?tail=50&since=3600`)).json
      .logs as string;
    expect(all).toContain("hola mundo");
    expect(recent).not.toContain("hola mundo");
  });

  it("opens a real tunnel between two networks and only that port crosses", async () => {
    await call("POST", "/networks", { name: `${PREFIX}b`, internal: true });
    const nets = (await call("GET", "/networks")).json as Net[];
    const a = nets.find((n) => n.name === `${PREFIX}a`);
    const b = nets.find((n) => n.name === `${PREFIX}b`);

    await call("POST", "/containers", {
      name: `${PREFIX}svc`,
      image: IMAGE,
      networkId: b?.id,
      restartPolicy: "no",
      command: ["sh", "-c", 'while true; do echo "pong" | nc -l -p 8080; done'],
    });
    const svc = ((await call("GET", "/containers")).json as Ctr[]).find(
      (c) => c.name === `${PREFIX}svc`,
    );

    const tunnel = await call("POST", "/tunnels", {
      fromNetworkId: a?.id,
      toNetworkId: b?.id,
      targetContainerId: svc?.id,
      targetPort: 8080,
    });
    expect(tunnel.res.status).toBe(201);
    await new Promise((r) => setTimeout(r, 1500));

    const containers = (await call("GET", "/containers")).json as Ctr[];
    const t = containers.find((c) => c.labels["nautix.tunnel"] === "true");
    expect(t?.networks.sort()).toEqual([`${PREFIX}a`, `${PREFIX}b`]);

    // From the source network the tunnel answers; the service itself is not reachable by name.
    const viaTunnel = docker("exec", `${PREFIX}web`, "sh", "-c", `nc -w 3 ${t?.name} 8080 || true`);
    expect(viaTunnel).toContain("pong");
    const direct = docker(
      "exec",
      `${PREFIX}web`,
      "sh",
      "-c",
      `nc -w 2 ${PREFIX}svc 8080 || echo blocked`,
    );
    expect(direct).toContain("blocked");

    expect((await call("DELETE", `/containers/${t?.id}?force=true`)).res.status).toBe(204);
  });

  it("applies routes to a real Traefik through its file provider", async () => {
    const nets = (await call("GET", "/networks")).json as Net[];
    const b = nets.find((n) => n.name === `${PREFIX}b`);
    const traefikImage = "traefik:v3.1";
    try {
      docker("image", "inspect", traefikImage);
    } catch {
      return; // image not available offline: nothing to verify
    }
    const created = await call("POST", "/containers", {
      name: `${PREFIX}edge`,
      image: traefikImage,
      networkId: b?.id,
      restartPolicy: "no",
      volumes: ["/etc/traefik/dynamic"],
      command: [
        "--providers.docker=false",
        "--providers.file.directory=/etc/traefik/dynamic",
        "--providers.file.watch=true",
        "--entrypoints.web.address=:80",
      ],
    });
    expect(created.res.status).toBe(201);
    const gateways = (await call("GET", "/gateways")).json as { name: string; kind: string }[];
    expect(gateways.find((g) => g.name === `${PREFIX}edge`)?.kind).toBe("traefik");

    const saved = await call("PUT", `/gateways/${PREFIX}edge/routes`, {
      routes: [
        { name: "api", path: "/api", upstream: `http://${PREFIX}svc:8080`, stripPath: true },
      ],
    });
    expect(saved.res.status).toBe(204);
    const applied = await call("POST", `/gateways/${PREFIX}edge/apply`);
    expect(applied.res.status).toBe(200);
    expect(applied.json.ok).toBe(true);

    const file = docker("exec", `${PREFIX}edge`, "cat", "/etc/traefik/dynamic/nautix.yml");
    expect(file).toContain(`http://${PREFIX}svc:8080`);
    expect(file).toContain("/api");
  });

  it("builds an image from a Dockerfile with the real builder and runs it", async () => {
    const post = (body: unknown) =>
      fetch(`${base}/api/v1/builds`, {
        method: "POST",
        headers: { cookie, "x-nautix-csrf": "1", "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    const res = await post({
      tag: `${PREFIX}built:1`,
      dockerfile: `FROM ${IMAGE}\nARG GREETING=hola\nCOPY hello.txt /hello.txt\nRUN echo "$GREETING" > /greeting.txt\nCMD ["cat", "/hello.txt", "/greeting.txt"]\n`,
      files: [{ path: "hello.txt", content: "from the context\n" }],
      buildArgs: { GREETING: "buenas" },
    });
    const text = await res.text();
    expect(text.trim().endsWith("NAUTIX-BUILD: ok")).toBe(true);
    expect(docker("run", "--rm", "--network", "none", `${PREFIX}built:1`)).toBe(
      "from the context\nbuenas",
    );

    const failed = await (
      await post({ tag: `${PREFIX}bad:1`, dockerfile: `FROM ${IMAGE}\nRUN exit 3\n` })
    ).text();
    expect(failed).toContain("ERROR:");
    expect(failed.trim().endsWith("NAUTIX-BUILD: failed")).toBe(true);
    docker("rmi", "-f", `${PREFIX}built:1`);
  });

  it("creates a container without starting it, with a healthcheck and limits", async () => {
    const res = await call("POST", "/containers", {
      name: `${PREFIX}limited`,
      image: IMAGE,
      networkId: null,
      restartPolicy: "no",
      start: false,
      command: ["sleep", "300"],
      healthcheck: { command: "true", intervalSeconds: 1, retries: 1 },
      limits: { memoryMb: 64, cpus: 0.5 },
    });
    expect(res.res.status).toBe(201);
    const inspect = JSON.parse(docker("inspect", `${PREFIX}limited`))[0];
    expect(inspect.State.Status).toBe("created");
    expect(inspect.HostConfig.Memory).toBe(64 * 1024 * 1024);
    expect(inspect.HostConfig.NanoCpus).toBe(500_000_000);
    expect(inspect.Config.Healthcheck.Test).toEqual(["CMD-SHELL", "true"]);

    expect((await call("POST", `/containers/${inspect.Id}/start`)).res.status).toBe(204);
    await new Promise((r) => setTimeout(r, 3000));
    expect(JSON.parse(docker("inspect", `${PREFIX}limited`))[0].State.Health.Status).toBe(
      "healthy",
    );
  });

  it("runs a real swarm service: create, scale, logs, secrets and configs", async () => {
    let status = (await call("GET", "/swarm")).json as { active: boolean };
    const startedHere = !status.active;
    if (startedHere) {
      expect((await call("POST", "/swarm/init", { advertiseAddr: "127.0.0.1" })).res.status).toBe(
        201,
      );
    }
    try {
      status = (await call("GET", "/swarm")).json as { active: boolean };
      expect(status.active).toBe(true);
      const nodes = (await call("GET", "/swarm/nodes")).json as { role: string; leader: boolean }[];
      expect(nodes.some((n) => n.role === "manager")).toBe(true);

      const created = await call("POST", "/swarm/services", {
        name: `${PREFIX}svc-swarm`,
        image: IMAGE,
        replicas: 1,
        env: { WHO: "swarm" },
        command: ["sh", "-c", 'echo "hello from $WHO"; sleep 300'],
      });
      expect(created.res.status).toBe(201);
      const id = (created.json as { id: string }).id;

      let running = 0;
      for (let i = 0; i < 40 && running < 1; i++) {
        await new Promise((r) => setTimeout(r, 500));
        const list = (await call("GET", "/swarm/services")).json as {
          id: string;
          running: number;
        }[];
        running = list.find((s) => s.id === id)?.running ?? 0;
      }
      expect(running).toBe(1);
      const logs = (await call("GET", `/swarm/services/${id}/logs?tail=20`)).json.logs as string;
      expect(logs).toContain("hello from swarm");
      const tasks = (await call("GET", `/swarm/services/${id}/tasks`)).json as { state: string }[];
      expect(tasks.some((t) => t.state === "running")).toBe(true);

      expect((await call("PATCH", `/swarm/services/${id}`, { replicas: 2 })).res.status).toBe(204);
      const scaled = (
        (await call("GET", "/swarm/services")).json as { id: string; replicas: number }[]
      ).find((s) => s.id === id);
      expect(scaled?.replicas).toBe(2);

      expect(
        (await call("POST", "/swarm/secrets", { name: `${PREFIX}secret`, value: "top-secret" })).res
          .status,
      ).toBe(204);
      expect(
        (await call("POST", "/swarm/configs", { name: `${PREFIX}config`, value: "a=1" })).res
          .status,
      ).toBe(204);
      const cfg = (
        (await call("GET", "/swarm/configs")).json as { id: string; name: string }[]
      ).find((c) => c.name === `${PREFIX}config`);
      expect(
        ((await call("GET", `/swarm/configs/${cfg?.id}/data`)).json as { data: string }).data,
      ).toBe("a=1");

      const deployed = await call("POST", "/swarm/stacks", {
        name: "nxit-stack",
        yaml: `services:\n  worker:\n    image: ${IMAGE}\n    command: ["sleep", "300"]\n`,
      });
      expect(
        (deployed.json as { ok: boolean; output: string }).ok,
        (deployed.json as { output: string }).output,
      ).toBe(true);
      const stacks = (await call("GET", "/swarm/stacks")).json as {
        name: string;
        services: number;
      }[];
      expect(stacks).toContainEqual({ name: "nxit-stack", services: 1 });
      const removed = await call("DELETE", "/swarm/stacks/nxit-stack");
      expect((removed.json as { ok: boolean }).ok).toBe(true);

      expect((await call("DELETE", `/swarm/services/${id}`)).res.status).toBe(204);
      for (const s of (
        (await call("GET", "/swarm/secrets")).json as { id: string; name: string }[]
      ).filter((x) => x.name.startsWith(PREFIX)))
        await call("DELETE", `/swarm/secrets/${s.id}`);
      await call("DELETE", `/swarm/configs/${cfg?.id}`);
    } finally {
      if (startedHere) await call("POST", "/swarm/leave", { force: true });
    }
  });

  it("removes what it created", async () => {
    const list = (await call("GET", "/containers")).json as Ctr[];
    for (const c of list.filter((c) => c.name.startsWith(PREFIX)))
      expect((await call("DELETE", `/containers/${c.id}?force=true`)).res.status).toBe(204);
    const nets = (await call("GET", "/networks")).json as Net[];
    for (const n of nets.filter((n) => n.name.startsWith(PREFIX)))
      expect((await call("DELETE", `/networks/${n.id}`)).res.status).toBe(204);
    expect(
      ((await call("GET", "/containers")).json as Ctr[]).some((c) => c.name.startsWith(PREFIX)),
    ).toBe(false);
  });
});
