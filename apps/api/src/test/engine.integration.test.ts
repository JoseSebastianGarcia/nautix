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
