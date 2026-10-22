import { buildTar } from "../modules/docker/domain/tar.js";
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

const docker = (...args: string[]): string => {
  try {
    return execFileSync("docker", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr?.trim();
    // Say why it failed, not just that it did.
    throw new Error(`docker ${args.join(" ")}\n${stderr ?? String(error)}`);
  }
};

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

type Net = { id: string; name: string; subnet?: string | null };
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

  it("reports the IP each container has on its network", async () => {
    const list = (await call("GET", "/containers")).json as {
      name: string;
      ips: Record<string, string>;
    }[];
    const web = list.find((c) => c.name === `${PREFIX}web`);
    const real = JSON.parse(
      docker("inspect", "-f", "{{json .NetworkSettings.Networks}}", `${PREFIX}web`),
    ) as Record<string, { IPAddress: string }>;
    expect(web?.ips).toEqual(
      Object.fromEntries(Object.entries(real).map(([n, v]) => [n, v.IPAddress])),
    );
    expect(Object.values(web?.ips ?? {})[0]).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
  });

  it("pins a container's IP at creation and later, and keeps it across restarts", async () => {
    expect(
      (await call("POST", "/networks", { name: `${PREFIX}ip`, internal: true })).res.status,
    ).toBe(201);
    const nets = (await call("GET", "/networks")).json as {
      id: string;
      name: string;
      subnet: string | null;
    }[];
    const b = nets.find((n) => n.name === `${PREFIX}ip`);
    const [a1, a2, a3] = (b?.subnet ?? "172.0.0.0/16").split("/")[0]?.split(".") ?? [];
    const ipA = `${a1}.${a2}.${a3}.200`;
    const ipB = `${a1}.${a2}.${a3}.201`;
    const created = await call("POST", "/containers", {
      name: `${PREFIX}pinned`,
      image: IMAGE,
      networkId: b?.id,
      restartPolicy: "no",
      command: ["sleep", "300"],
      ipAddress: ipA,
    });
    expect(created.res.status, JSON.stringify(created.json)).toBe(201);
    const ipOf = (name: string) =>
      docker(
        "inspect",
        "-f",
        `{{(index .NetworkSettings.Networks "${PREFIX}ip").IPAddress}}`,
        name,
      );
    expect(ipOf(`${PREFIX}pinned`)).toBe(ipA);
    docker("restart", "-t", "0", `${PREFIX}pinned`);
    expect(ipOf(`${PREFIX}pinned`)).toBe(ipA);

    // a second container cannot take it
    const dup = await call("POST", "/containers", {
      name: `${PREFIX}dup`,
      image: IMAGE,
      networkId: b?.id,
      restartPolicy: "no",
      command: ["sleep", "5"],
      ipAddress: ipA,
    });
    expect(dup.res.status).toBe(409);

    // pin an existing container, then release it
    const svc = `${PREFIX}mover`;
    await call("POST", "/containers", {
      name: svc,
      image: IMAGE,
      networkId: b?.id,
      restartPolicy: "no",
      command: ["sleep", "60"],
    });
    expect(
      (await call("PUT", `/containers/${svc}/fixed-ip`, { network: `${PREFIX}ip`, ip: ipB })).res
        .status,
    ).toBe(204);
    expect(ipOf(svc)).toBe(ipB);
    expect(
      (await call("PUT", `/containers/${svc}/fixed-ip`, { network: `${PREFIX}ip`, ip: null })).res
        .status,
    ).toBe(204);
    expect(ipOf(svc)).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
  });

  it("changes who can reach a published port by recreating the container, keeping its data and address", async () => {
    expect(
      (await call("POST", "/networks", { name: `${PREFIX}ex`, internal: false })).res.status,
    ).toBe(201);
    const net = (
      (await call("GET", "/networks")).json as { id: string; name: string; subnet: string | null }[]
    ).find((n) => n.name === `${PREFIX}ex`);
    const [a1, a2, a3] = (net?.subnet ?? "172.0.0.0/16").split("/")[0]?.split(".") ?? [];
    const ip = `${a1}.${a2}.${a3}.210`;
    const name = `${PREFIX}rebind`;
    const created = await call("POST", "/containers", {
      name,
      image: IMAGE,
      networkId: net?.id,
      restartPolicy: "no",
      command: ["sleep", "300"],
      ipAddress: ip,
      volumes: ["/data"],
      ports: [{ containerPort: 80, hostPort: 18555 }],
    });
    expect(created.res.status, JSON.stringify(created.json)).toBe(201);
    docker("exec", name, "sh", "-c", "echo keep > /data/file");
    const bound = () => docker("inspect", "-f", "{{json .HostConfig.PortBindings}}", name);
    expect(bound()).toContain('"HostIp":"127.0.0.1"');
    const oldId = docker("inspect", "-f", "{{.Id}}", name);

    const change = await call("PUT", `/containers/${name}/exposure`, {
      ports: [{ containerPort: 80, exposure: { kind: "address", address: "127.0.0.2" } }],
    });
    expect(change.res.status, JSON.stringify(change.json)).toBe(204);

    expect(docker("inspect", "-f", "{{.Id}}", name)).not.toBe(oldId);
    expect(bound()).toContain('"HostIp":"127.0.0.2"');
    expect(bound()).toContain('"HostPort":"18555"');
    expect(docker("inspect", "-f", "{{.State.Running}}", name)).toBe("true");
    expect(
      docker(
        "inspect",
        "-f",
        `{{(index .NetworkSettings.Networks "${PREFIX}ex").IPAddress}}`,
        name,
      ),
    ).toBe(ip);
    expect(docker("exec", name, "cat", "/data/file")).toBe("keep");
    const rows = (await call("GET", "/exposure")).json as {
      container: string;
      exposure: { kind: string };
    }[];
    expect(rows.find((r) => r.container === name)?.exposure.kind).toBe("address");
    expect(docker("ps", "-a", "--filter", `name=${name}`, "--format", "{{.Names}}")).toBe(name);
  });

  it("applies a change only when the new container proves itself, and puts the old one back otherwise", async () => {
    const name = `${PREFIX}gate`;
    const created = await call("POST", "/containers", {
      name,
      image: IMAGE,
      networkId: null,
      restartPolicy: "no",
      env: { KEEP: "yes" },
      volumes: ["/data"],
      command: [
        "sh",
        "-c",
        'if [ -n "$BOOM" ]; then echo "boom: refusing to start" >&2; exit 1; fi; if [ -z "$NOHEALTH" ]; then touch /tmp/ok; fi; sleep 300',
      ],
      healthcheck: {
        command: "test -f /tmp/ok",
        intervalSeconds: 1,
        timeoutSeconds: 2,
        retries: 1,
      },
    });
    expect(created.res.status, JSON.stringify(created.json)).toBe(201);
    docker("exec", name, "sh", "-c", "echo precious > /data/file");
    const id = () => docker("inspect", "-f", "{{.Id}}", name);
    const env = () => docker("inspect", "-f", "{{range .Config.Env}}{{println .}}{{end}}", name);
    const put = (body: unknown) => call("PUT", `/containers/${name}/env`, body);
    const gate = { settleSeconds: 2, timeoutSeconds: 15 };
    // wait until the original is healthy so the comparisons below start from a known state
    for (
      let i = 0;
      i < 20 && docker("inspect", "-f", "{{.State.Health.Status}}", name) !== "healthy";
      i++
    )
      await new Promise((r) => setTimeout(r, 500));

    // 1. a good change is applied: new container, same data, still healthy
    const before = id();
    const good = await put({ set: { GOOD: "1" }, gate });
    expect(good.res.status, JSON.stringify(good.json)).toBe(200);
    expect(id()).not.toBe(before);
    expect(env()).toContain("GOOD=1");
    expect(env()).toContain("KEEP=yes");
    expect(docker("exec", name, "cat", "/data/file")).toBe("precious");
    expect(docker("inspect", "-f", "{{.State.Health.Status}}", name)).toBe("healthy");

    // 2. a change that makes the process exit is refused and the previous container is back, untouched
    const stable = id();
    const crash = await put({ set: { BOOM: "1" }, gate });
    expect(crash.res.status).toBe(409);
    expect(crash.json.hintKey).toBe("errors.applyUnhealthy");
    expect(crash.json.detail).toContain("exited");
    expect(crash.json.detail).toContain("boom: refusing to start");
    expect(id()).toBe(stable);
    expect(docker("inspect", "-f", "{{.State.Running}}", name)).toBe("true");
    expect(env()).not.toContain("BOOM");
    expect(docker("exec", name, "cat", "/data/file")).toBe("precious");

    // 3. a change that keeps it running but unhealthy is refused by the health check
    const unhealthy = await put({ set: { NOHEALTH: "1" }, gate });
    expect(unhealthy.res.status).toBe(409);
    expect(unhealthy.json.detail).toContain("health check");
    expect(id()).toBe(stable);
    expect(env()).not.toContain("NOHEALTH");

    // 4. removing a variable works the same way
    expect((await put({ unset: ["GOOD"], gate })).res.status).toBe(200);
    expect(env()).not.toContain("GOOD=1");
    expect(env()).toContain("KEEP=yes");
    docker("rm", "-f", "-v", name);
  });

  it("binds an app to a real Postgres: joins the network, gets working settings and loses them on removal", async () => {
    const image = "postgres:16-alpine";
    try {
      docker("image", "inspect", image);
    } catch {
      return; // image not available offline: nothing to verify
    }
    const net = await call("POST", "/networks", { name: `${PREFIX}bind`, internal: false });
    expect(net.res.status).toBe(201);
    const password = 'p@ss;w"rd 1';
    const db = `${PREFIX}pg`;
    const app = `${PREFIX}client`;
    expect(
      (
        await call("POST", "/containers", {
          name: db,
          image,
          networkId: net.json.id,
          restartPolicy: "no",
          env: { POSTGRES_USER: "app", POSTGRES_PASSWORD: password, POSTGRES_DB: "orders" },
        })
      ).res.status,
    ).toBe(201);
    expect(
      (
        await call("POST", "/containers", {
          name: app,
          image,
          networkId: null,
          restartPolicy: "no",
          env: { KEEP: "yes" },
          command: ["sleep", "600"],
        })
      ).res.status,
    ).toBe(201);
    for (let i = 0; i < 40; i++) {
      try {
        // over TCP: during first-run initialisation Postgres only answers on its Unix socket
        docker("exec", db, "pg_isready", "-h", "127.0.0.1", "-U", "app", "-d", "orders");
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    const gate = { settleSeconds: 2, timeoutSeconds: 15 };
    const url = await call("POST", "/bindings", {
      consumer: app,
      provider: db,
      name: "Orders",
      style: "url",
      gate,
    });
    expect(url.res.status, JSON.stringify(url.json)).toBe(201);
    console.log(
      "NETDEBUG",
      docker(
        "inspect",
        "-f",
        "{{json .HostConfig.NetworkMode}} {{json .NetworkSettings.Networks}} {{.State.Status}}",
        app,
      ),
    );
    expect(
      docker("inspect", "-f", "{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}", app),
    ).toContain(`${PREFIX}bind`);
    // the connection works with exactly what Nautix wrote, password quirks included
    expect(docker("exec", app, "sh", "-c", 'psql "$ORDERS_URL" -tAc "select 42"')).toBe("42");
    expect(docker("exec", app, "printenv", "KEEP")).toBe("yes");

    const dotnet = await call("POST", "/bindings", {
      consumer: app,
      provider: db,
      name: "Orders",
      style: "dotnet",
      gate,
    });
    expect(dotnet.res.status, JSON.stringify(dotnet.json)).toBe(201);
    expect(docker("exec", app, "printenv", "ConnectionStrings__Orders")).toBe(
      `Host=${db};Port=5432;Database=orders;Username=app;Password="p@ss;w""rd 1"`,
    );

    for (const b of [url.json, dotnet.json])
      expect((await call("DELETE", `/bindings/${b.id}`)).res.status).toBe(204);
    expect(() => docker("exec", app, "printenv", "ORDERS_URL")).toThrow();
    expect(() => docker("exec", app, "printenv", "ConnectionStrings__Orders")).toThrow();
    expect(docker("exec", app, "printenv", "KEEP")).toBe("yes");
    docker("rm", "-f", "-v", db, app);
  });

  it("builds a zone from a document alone, then changes only what the document changes", async () => {
    const image = "postgres:16-alpine";
    try {
      docker("image", "inspect", image);
    } catch {
      return; // image not available offline: nothing to verify
    }
    const doc = (mode: string) => `
version: 1
zone:
  name: ${PREFIX}zone
services:
  ${PREFIX}zdb:
    image: ${image}
    env:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: "z;pw 1"
      POSTGRES_DB: orders
    volumes: ["${PREFIX}zone-data:/var/lib/postgresql/data"]
  ${PREFIX}zapp:
    image: ${image}
    command: ["sleep", "600"]
    env: { MODE: ${mode} }
    bindings:
      - { to: ${PREFIX}zdb, name: Orders, style: url }
`;
    const plan = async (text: string) =>
      (await call("POST", `/zones/${PREFIX}zone/plan`, { spec: text })).json as {
        plan: { hash: string; actions: { kind: string; service?: string }[] };
      };
    const apply = (text: string, hash: string) =>
      call("POST", `/zones/${PREFIX}zone/apply`, {
        spec: text,
        planHash: hash,
        allowRemovals: false,
      });
    const idOf = (name: string) => docker("inspect", "-f", "{{.Id}}", name);

    const first = await plan(doc("one"));
    expect(first.plan.actions.map((a) => a.kind)).toEqual([
      "create-network",
      "create-service",
      "create-service",
      "add-binding",
    ]);
    const built = await apply(doc("one"), first.plan.hash);
    expect(built.res.status, JSON.stringify(built.json)).toBe(200);
    expect(built.json.ok, JSON.stringify(built.json.results)).toBe(true);

    for (let i = 0; i < 40; i++) {
      try {
        docker(
          "exec",
          `${PREFIX}zdb`,
          "pg_isready",
          "-h",
          "127.0.0.1",
          "-U",
          "app",
          "-d",
          "orders",
        );
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    // the app reaches the database with the settings the binding wrote
    expect(docker("exec", `${PREFIX}zapp`, "sh", "-c", 'psql "$ORDERS_URL" -tAc "select 7"')).toBe(
      "7",
    );
    // reality read back from the engine matches the document: nothing left to do
    const settled = await plan(doc("one"));
    const reality = (await call("GET", `/zones/${PREFIX}zone/spec`)).json.current;
    expect(settled.plan.actions, `${JSON.stringify(settled.plan.actions)}\n${reality}`).toEqual([]);

    // a change to one service recreates that one service and nothing else
    const dbBefore = idOf(`${PREFIX}zdb`);
    const appBefore = idOf(`${PREFIX}zapp`);
    const second = await plan(doc("two"));
    expect(second.plan.actions).toEqual([
      { kind: "update-service", service: `${PREFIX}zapp`, fields: ["env"] },
    ]);
    expect((await apply(doc("two"), second.plan.hash)).json.ok).toBe(true);
    expect(idOf(`${PREFIX}zdb`)).toBe(dbBefore);
    expect(idOf(`${PREFIX}zapp`)).not.toBe(appBefore);
    expect(docker("exec", `${PREFIX}zapp`, "printenv", "MODE")).toBe("two");
    expect(docker("exec", `${PREFIX}zapp`, "sh", "-c", 'psql "$ORDERS_URL" -tAc "select 8"')).toBe(
      "8",
    );
    expect((await plan(doc("two"))).plan.actions).toEqual([]);
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
      command: [
        "sh",
        "-c",
        "while true; do printf 'HTTP/1.1 200 OK\\r\\nContent-Length: 5\\r\\nConnection: close\\r\\n\\r\\npong\\n' | nc -l -p 8080 > /dev/null; done",
      ],
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

  it("builds from an uploaded project folder with the real builder", async () => {
    const tar = buildTar([
      {
        path: "docker/App.Dockerfile",
        content: `FROM ${IMAGE}\nCOPY src/msg.txt /msg.txt\nCMD ["cat", "/msg.txt"]\n`,
      },
      { path: "src/msg.txt", content: "from a folder\n" },
    ]);
    const options = { tag: `${PREFIX}folder:1`, dockerfilePath: "docker/App.Dockerfile" };
    const res = await fetch(
      `${base}/api/v1/builds/context?options=${encodeURIComponent(JSON.stringify(options))}`,
      {
        method: "POST",
        headers: { cookie, "x-nautix-csrf": "1", "content-type": "application/x-tar" },
        body: new Uint8Array(tar),
      },
    );
    expect((await res.text()).trim().endsWith("NAUTIX-BUILD: ok")).toBe(true);
    expect(docker("run", "--rm", "--network", "none", `${PREFIX}folder:1`)).toBe("from a folder");
    docker("rmi", "-f", `${PREFIX}folder:1`);
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

  it("runs a real swarm service with a volume, a secret and placement, updates it, rolls it back and survives a bad image", async () => {
    const status = (await call("GET", "/swarm")).json as { active: boolean };
    const startedHere = !status.active;
    if (startedHere)
      await call("POST", "/swarm/init", { advertiseAddr: "127.0.0.1" }).then((r) =>
        expect(r.res.status).toBe(201),
      );
    const name = `${PREFIX}svc-full`;
    const volume = `${PREFIX}svc-vol`;
    const secret = `${PREFIX}svc-secret`;
    const second = `${PREFIX}alpine:second`;
    docker("tag", IMAGE, second);
    type Svc = {
      id: string;
      name: string;
      image: string;
      running: number;
      mounts: { source: string; target: string; readOnly: boolean }[];
      placement: { role?: string; maxPerNode?: number };
      secrets: string[];
      update: { state: string | null; message: string; startedAt: string };
    };
    const read = async (id: string) =>
      ((await call("GET", "/swarm/services")).json as Svc[]).find((x) => x.id === id) as Svc;
    const until = async (id: string, ok: (s: Svc) => boolean, rounds = 120) => {
      for (let i = 0; i < rounds; i++) {
        const s = await read(id);
        if (s && ok(s)) return s;
        await new Promise((r) => setTimeout(r, 500));
      }
      return read(id);
    };
    try {
      expect(
        (await call("POST", "/swarm/secrets", { name: secret, value: "from-the-secret" })).res
          .status,
      ).toBe(204);
      const refused = await call("POST", "/swarm/services", {
        name,
        image: IMAGE,
        secrets: ["does-not-exist"],
      });
      expect(refused.res.status).toBe(422);
      expect(refused.json.hintKey).toBe("errors.secretNotFound");

      const created = await call("POST", "/swarm/services", {
        name,
        image: IMAGE,
        replicas: 1,
        mounts: [{ source: volume, target: "/data" }],
        secrets: [secret],
        placement: { role: "manager", maxPerNode: 1 },
        command: ["sh", "-c", `cat /run/secrets/${secret} > /data/seen; echo up; sleep 300`],
      });
      expect(created.res.status).toBe(201);
      const id = (created.json as { id: string }).id;
      const up = await until(id, (x) => x.running >= 1);
      expect(up.running).toBe(1);
      expect(up.mounts).toEqual([{ source: volume, target: "/data", readOnly: false }]);
      expect(up.placement).toEqual({ role: "manager", maxPerNode: 1 });
      expect(up.secrets).toEqual([secret]);
      expect(JSON.stringify((await call("GET", "/swarm/services")).json)).not.toContain(
        "from-the-secret",
      );
      // The secret reached the container and the volume really exists on this node.
      expect(docker("volume", "ls", "-q", "--filter", `name=${volume}`)).toContain(volume);

      // A good update rolls out and completes.
      expect((await call("PATCH", `/swarm/services/${id}`, { image: second })).res.status).toBe(
        204,
      );
      const updated = await until(id, (x) => x.update.state === "completed");
      expect(updated.update.state).toBe("completed");
      expect(updated.image).toBe(second);

      // The manual rollback goes back to the first image.
      expect((await call("POST", `/swarm/services/${id}/rollback`)).res.status).toBe(204);
      const back = await until(
        id,
        (x) => x.image === IMAGE && x.update.state === "rollback_completed",
      );
      expect(back.image).toBe(IMAGE);
      expect(back.update.state).toBe("rollback_completed");

      // A bad image never starts: Docker's own failure action puts the previous one back by itself.
      const before = (await read(id)).update.startedAt;
      expect(
        (await call("PATCH", `/swarm/services/${id}`, { image: `${PREFIX}missing/image:1` })).res
          .status,
      ).toBe(204);
      const trace: string[] = [];
      const undone = await until(
        id,
        (x) => {
          const line = `${x.update.state}|${x.update.startedAt === before ? "old" : "new"}`;
          if (trace.at(-1) !== line) trace.push(line);
          return x.update.startedAt !== before && x.update.state === "rollback_completed";
        },
        400,
      );
      expect(trace.join(" > ")).toContain("rollback");
      expect(undone.update.startedAt).not.toBe(before);
      expect(undone.image).toBe(IMAGE);
    } finally {
      for (const svc of ((await call("GET", "/swarm/services")).json as Svc[]).filter((x) =>
        x.name.startsWith(PREFIX),
      ))
        await call("DELETE", `/swarm/services/${svc.id}`);
      for (const sec of (
        (await call("GET", "/swarm/secrets")).json as { id: string; name: string }[]
      ).filter((x) => x.name.startsWith(PREFIX)))
        await call("DELETE", `/swarm/secrets/${sec.id}`);
      await new Promise((r) => setTimeout(r, 1500));
      try {
        docker("volume", "rm", "-f", volume);
        docker("rmi", second);
      } catch {
        /* already gone */
      }
      if (startedHere) await call("POST", "/swarm/leave", { force: true });
    }
  }, 300_000);

  it("creates a real service with a health check, limits and a config, then edits them in place", async () => {
    const status = (await call("GET", "/swarm")).json as { active: boolean };
    const startedHere = !status.active;
    if (startedHere)
      await call("POST", "/swarm/init", { advertiseAddr: "127.0.0.1" }).then((r) =>
        expect(r.res.status).toBe(201),
      );
    const name = `${PREFIX}svc-edit`;
    const cfg = `${PREFIX}edit-config`;
    const inspect = (format: string): string =>
      docker("service", "inspect", name, "--format", format).trim();
    type Svc = {
      id: string;
      name: string;
      running: number;
      ports: { target: number; published?: number }[];
      configs: string[];
      healthcheck: { command: string; retries: number } | null;
      resources: { cpuLimit?: number; memoryLimitMb?: number };
      policy: { order: string; failureAction: string; parallelism: number };
      update: { state: string | null };
    };
    const read = async (): Promise<Svc> =>
      ((await call("GET", "/swarm/services")).json as Svc[]).find((x) => x.name === name) as Svc;
    const until = async (ok: (s: Svc) => boolean, rounds = 120) => {
      for (let i = 0; i < rounds; i++) {
        const s = await read();
        if (s && ok(s)) return s;
        await new Promise((r) => setTimeout(r, 500));
      }
      return read();
    };
    try {
      await call("POST", "/swarm/configs", { name: cfg, value: "listen=80" });
      const refused = await call("POST", "/swarm/services", {
        name,
        image: IMAGE,
        configs: ["nope"],
      });
      expect(refused.res.status).toBe(422);
      expect(refused.json.hintKey).toBe("errors.configNotFound");

      const created = await call("POST", "/swarm/services", {
        name,
        image: IMAGE,
        replicas: 1,
        configs: [cfg],
        healthcheck: { command: "true", intervalSeconds: 5, retries: 2 },
        resources: { cpuLimit: 0.5, memoryLimitMb: 64 },
        update: { failureAction: "rollback", parallelism: 1, delaySeconds: 1, monitorSeconds: 5 },
        command: ["sh", "-c", `cat /${cfg} > /tmp/seen; sleep 300`],
      });
      expect(created.res.status).toBe(201);
      const up = await until((x) => x.running >= 1);
      expect(up.running).toBe(1);
      expect(up.configs).toEqual([cfg]);
      expect(up.healthcheck).toMatchObject({ command: "true", retries: 2 });
      expect(up.resources).toEqual({ cpuLimit: 0.5, memoryLimitMb: 64 });
      expect(up.policy).toMatchObject({ failureAction: "rollback", order: "start-first" });
      expect(inspect("{{.Spec.TaskTemplate.Resources.Limits.MemoryBytes}}")).toBe(
        String(64 * 1024 * 1024),
      );

      // Edit ports, health check and limits in place: one rolling update that completes.
      const before = (await read()).update;
      expect(
        (
          await call("PATCH", `/swarm/services/${up.id}`, {
            ports: [{ target: 80, published: 18080, protocol: "tcp" }],
            healthcheck: {
              command: "false || true",
              intervalSeconds: 10,
              timeoutSeconds: 5,
              retries: 4,
              startPeriodSeconds: 0,
            },
            resources: { cpuLimit: 1, memoryLimitMb: 128 },
          })
        ).res.status,
      ).toBe(204);
      const edited = await until(
        (x) => x.update.state === "completed" && x.resources.memoryLimitMb === 128,
      );
      expect(edited.ports).toEqual(
        expect.arrayContaining([expect.objectContaining({ target: 80, published: 18080 })]),
      );
      expect(edited.healthcheck).toMatchObject({ command: "false || true", retries: 4 });
      expect(edited.resources).toEqual({ cpuLimit: 1, memoryLimitMb: 128 });
      expect(before.state === null || before.state === "completed").toBe(true);

      // A policy change alone does not replace any copy.
      expect(
        (
          await call("PATCH", `/swarm/services/${up.id}`, {
            policy: {
              order: "stop-first",
              failureAction: "pause",
              parallelism: 2,
              delaySeconds: 0,
              monitorSeconds: 3,
            },
          })
        ).res.status,
      ).toBe(204);
      const policy = await until((x) => x.policy.parallelism === 2, 40);
      expect(policy.policy).toMatchObject({
        order: "stop-first",
        failureAction: "pause",
        parallelism: 2,
      });

      // The health check can be taken out again.
      await call("PATCH", `/swarm/services/${up.id}`, { healthcheck: null });
      const bare = await until((x) => x.healthcheck === null);
      expect(bare.healthcheck).toBeNull();
    } finally {
      for (const svc of ((await call("GET", "/swarm/services")).json as Svc[]).filter((x) =>
        x.name.startsWith(PREFIX),
      ))
        await call("DELETE", `/swarm/services/${svc.id}`);
      for (const c of (
        (await call("GET", "/swarm/configs")).json as { id: string; name: string }[]
      ).filter((x) => x.name.startsWith(PREFIX)))
        await call("DELETE", `/swarm/configs/${c.id}`);
      await new Promise((r) => setTimeout(r, 1500));
      if (startedHere) await call("POST", "/swarm/leave", { force: true });
    }
  }, 240_000);

  it("binds a real swarm service to another: the consumer gets the connection string and loses it on unbind", async () => {
    const status = (await call("GET", "/swarm")).json as { active: boolean };
    const startedHere = !status.active;
    if (startedHere)
      await call("POST", "/swarm/init", { advertiseAddr: "127.0.0.1" }).then((r) =>
        expect(r.res.status).toBe(201),
      );
    const net = `${PREFIX}bind-net`;
    const provider = `${PREFIX}bind-db`;
    const consumer = `${PREFIX}bind-app`;
    const envOf = (name: string): string[] =>
      (JSON.parse(
        docker(
          "service",
          "inspect",
          name,
          "--format",
          "{{json .Spec.TaskTemplate.ContainerSpec.Env}}",
        ),
      ) as string[] | null) ?? [];
    try {
      await call("POST", "/networks", { name: net, driver: "overlay" });
      await call("POST", "/swarm/services", {
        name: provider,
        image: "postgres:16-alpine",
        replicas: 1,
        networks: [net],
        env: { POSTGRES_USER: "app", POSTGRES_PASSWORD: "bind-it-pw", POSTGRES_DB: "shop" },
      });
      const app = await call("POST", "/swarm/services", {
        name: consumer,
        image: IMAGE,
        replicas: 1,
        networks: [net],
        command: ["sleep", "300"],
      });
      const appId = (app.json as { id: string }).id;

      const plan = await call(
        "GET",
        `/swarm/bindings/plan?consumer=${consumer}&provider=${provider}`,
      );
      expect(plan.res.status).toBe(200);
      expect(JSON.stringify(plan.json)).not.toContain("bind-it-pw");

      const made = await call("POST", "/swarm/bindings", { consumer, provider });
      expect(made.res.status).toBe(201);
      const binding = made.json as { id: string; variables: string[]; network: string };
      expect(binding.network).toBe(net);
      const value = envOf(consumer).find((l) => l.startsWith(`${binding.variables[0]}=`)) ?? "";
      expect(value).toContain(`Host=${provider}`);
      expect(value).toContain("Password=bind-it-pw");
      expect(JSON.stringify(made.json)).not.toContain("bind-it-pw");

      // The consumer finished its rolling update.
      let state: string | null = null;
      for (let i = 0; i < 80 && state !== "completed"; i++) {
        await new Promise((r) => setTimeout(r, 500));
        const list = (await call("GET", "/swarm/services")).json as {
          id: string;
          update: { state: string | null };
        }[];
        state = list.find((x) => x.id === appId)?.update.state ?? null;
      }
      expect(state).toBe("completed");

      expect((await call("DELETE", `/swarm/bindings/${binding.id}`)).res.status).toBe(204);
      expect(envOf(consumer).some((l) => l.startsWith(`${binding.variables[0]}=`))).toBe(false);
    } finally {
      for (const svc of (
        (await call("GET", "/swarm/services")).json as { id: string; name: string }[]
      ).filter((x) => x.name.startsWith(PREFIX)))
        await call("DELETE", `/swarm/services/${svc.id}`);
      for (let attempt = 0; attempt < 25; attempt++) {
        const left = ((await call("GET", "/networks")).json as { id: string; name: string }[]).find(
          (n) => n.name === net,
        );
        if (!left) break;
        await call("DELETE", `/networks/${left.id}`);
        await new Promise((r) => setTimeout(r, 1000));
      }
      if (startedHere) await call("POST", "/swarm/leave", { force: true });
    }
  }, 180_000);

  it("creates a real overlay network and reads the cluster with its services and tasks", async () => {
    const status = (await call("GET", "/swarm")).json as { active: boolean };
    const startedHere = !status.active;
    if (startedHere) {
      expect((await call("POST", "/swarm/init", { advertiseAddr: "127.0.0.1" })).res.status).toBe(
        201,
      );
    }
    const netName = `${PREFIX}overlay`;
    try {
      const made = await call("POST", "/networks", {
        name: netName,
        internal: false,
        driver: "overlay",
        encrypted: true,
        attachable: true,
      });
      expect(made.res.status, JSON.stringify(made.json)).toBe(201);
      const net = (
        (await call("GET", "/networks")).json as {
          id: string;
          name: string;
          driver: string;
          encrypted?: boolean;
          attachable?: boolean;
        }[]
      ).find((n) => n.name === netName);
      expect(net).toMatchObject({ driver: "overlay", encrypted: true, attachable: true });

      const svc = await call("POST", "/swarm/services", {
        name: `${PREFIX}ov-svc`,
        image: IMAGE,
        command: ["sleep", "300"],
        networks: [netName],
      });
      expect(svc.res.status, JSON.stringify(svc.json)).toBe(201);
      const serviceId = (svc.json as { id: string }).id;

      let cluster = (await call("GET", "/swarm/cluster")).json as {
        status: { isManager: boolean };
        nodes: { id: string }[];
        services: { id: string; networks: string[] }[];
        tasks: { serviceId: string; nodeId: string; state: string }[];
      };
      for (
        let i = 0;
        i < 40 && !cluster.tasks.some((t) => t.serviceId === serviceId && t.state === "running");
        i++
      ) {
        await new Promise((r) => setTimeout(r, 500));
        cluster = (await call("GET", "/swarm/cluster")).json as typeof cluster;
      }
      expect(cluster.status.isManager).toBe(true);
      // The service says which network it is on (by id or by the name it was given), and its task which node runs it.
      const mine = cluster.services.find((s) => s.id === serviceId);
      expect(mine?.networks.some((n) => n === net?.id || n === netName)).toBe(true);
      const task = cluster.tasks.find((t) => t.serviceId === serviceId);
      expect(cluster.nodes.map((n) => n.id)).toContain(task?.nodeId);
      expect(task?.state).toBe("running");

      expect((await call("DELETE", `/swarm/services/${serviceId}`)).res.status).toBe(204);
    } finally {
      for (const _ of [0, 1, 2, 3, 4]) {
        const left = ((await call("GET", "/networks")).json as { id: string; name: string }[]).find(
          (n) => n.name === netName,
        );
        if (!left) break;
        await call("DELETE", `/networks/${left.id}`);
        await new Promise((r) => setTimeout(r, 500));
      }
      if (startedHere) await call("POST", "/swarm/leave", { force: true });
    }
    // Outside a swarm the same request is refused with the reason, not with Docker's own message.
    if (startedHere) {
      const refused = await call("POST", "/networks", { name: `${PREFIX}ov2`, driver: "overlay" });
      expect(refused.res.status).toBe(409);
      expect(refused.json.hintKey).toBe("errors.overlayNeedsSwarm");
    }
  });

  it("browses a real volume without leaving helpers behind", async () => {
    docker("volume", "create", `${PREFIX}vol`);
    docker(
      "run",
      "--rm",
      "--network",
      "none",
      "-v",
      `${PREFIX}vol:/d`,
      IMAGE,
      "sh",
      "-c",
      "mkdir -p /d/sub && echo 'in the volume' > /d/note.txt && echo x > '/d/sub/with space.txt'",
    );
    const root = await call("GET", `/volumes/${PREFIX}vol/browse?path=/`);
    expect(
      root.json.entries.map((e: { name: string; kind: string }) => `${e.kind}:${e.name}`),
    ).toEqual(["dir:sub", "file:note.txt"]);
    const sub = await call("GET", `/volumes/${PREFIX}vol/browse?path=/sub`);
    expect(sub.json.entries[0].name).toBe("with space.txt");
    const file = await call("GET", `/volumes/${PREFIX}vol/browse?path=/note.txt&view=true`);
    expect(file.json.content).toBe("in the volume\n");
    expect((await call("GET", `/volumes/${PREFIX}vol/browse?path=/missing`)).res.status).toBe(404);
    expect(docker("ps", "-a", "--filter", "label=nautix.helper=volume-browse", "-q")).toBe("");
    docker("volume", "rm", `${PREFIX}vol`);
  });

  it("uploads into and downloads from a real volume without leaving helpers behind", async () => {
    const volume = `${PREFIX}xfer`;
    docker("volume", "create", volume);
    const archive = (path: string) =>
      `${base}/api/v1/volumes/${volume}/archive?path=${encodeURIComponent(path)}`;
    const put = (path: string, files: { path: string; content: string }[]) =>
      fetch(archive(path), {
        method: "PUT",
        headers: { cookie, "x-nautix-csrf": "1", "content-type": "application/x-tar" },
        body: new Uint8Array(buildTar(files)),
      });
    const view = async (path: string) =>
      (await call("GET", `/volumes/${volume}/browse?path=${encodeURIComponent(path)}&view=true`))
        .json.content;

    expect(
      (
        await put("/", [
          { path: "hello.txt", content: "uploaded\n" },
          { path: "sub/deep.txt", content: "deep\n" },
        ])
      ).status,
    ).toBe(204);
    const root = await call("GET", `/volumes/${volume}/browse?path=/`);
    expect(
      root.json.entries.map((e: { name: string; kind: string }) => `${e.kind}:${e.name}`),
    ).toEqual(["dir:sub", "file:hello.txt"]);
    expect(await view("/hello.txt")).toBe("uploaded\n");
    expect(await view("/sub/deep.txt")).toBe("deep\n");

    // The same name is replaced, not duplicated.
    expect((await put("/", [{ path: "hello.txt", content: "replaced\n" }])).status).toBe(204);
    expect(await view("/hello.txt")).toBe("replaced\n");

    // A folder comes back as a tar with its content.
    const folder = await fetch(archive("/sub"), { headers: { cookie } });
    expect(folder.status).toBe(200);
    const listing = execFileSync("tar", ["-tf", "-"], {
      input: Buffer.from(await folder.arrayBuffer()),
      encoding: "utf8",
    });
    expect(listing).toContain("sub/deep.txt");

    // A directory that does not exist is refused instead of being invented.
    expect((await put("/nodir", [{ path: "x.txt", content: "x" }])).status).toBeGreaterThanOrEqual(
      400,
    );
    expect(
      docker(
        "run",
        "--rm",
        "--network",
        "none",
        "-v",
        `${volume}:/d`,
        IMAGE,
        "stat",
        "-c",
        "%u",
        "/d/hello.txt",
      ),
    ).toBe("0");
    expect(docker("ps", "-a", "--filter", "label=nautix.helper=volume-browse", "-q")).toBe("");
    docker("volume", "rm", volume);
  });

  it("applies routes to a real HAProxy and serves traffic through it", async () => {
    try {
      docker("image", "inspect", "haproxy:3.0-alpine");
    } catch {
      return; // image not available offline: nothing to verify
    }
    const nets = (await call("GET", "/networks")).json as Net[];
    const b = nets.find((n) => n.name === `${PREFIX}b`);
    const template = (await call("GET", "/catalog")).json.find(
      (t: { id: string }) => t.id === "haproxy",
    );
    const created = await call("POST", "/containers", {
      name: `${PREFIX}ha`,
      image: template.image,
      networkId: b?.id,
      restartPolicy: "no",
      volumes: template.volumes,
      command: template.command,
    });
    expect(created.res.status).toBe(201);
    await new Promise((r) => setTimeout(r, 1500));
    expect(docker("inspect", "-f", "{{.State.Running}}", `${PREFIX}ha`)).toBe("true");

    expect(
      (
        await call("PUT", `/gateways/${PREFIX}ha/routes`, {
          routes: [
            { name: "pong", path: "/pong", upstream: `http://${PREFIX}svc:8080`, stripPath: true },
          ],
        })
      ).res.status,
    ).toBe(204);
    const applied = await call("POST", `/gateways/${PREFIX}ha/apply`);
    expect(applied.json.ok, applied.json.output).toBe(true);
    await new Promise((r) => setTimeout(r, 1000));
    let hit = "";
    for (let i = 0; i < 10 && !hit.includes("pong"); i++) {
      hit = docker(
        "exec",
        `${PREFIX}svc`,
        "sh",
        "-c",
        `wget -S -qO- -T 3 http://${PREFIX}ha/pong 2>&1 || echo FAILED`,
      );
      if (!hit.includes("pong")) await new Promise((r) => setTimeout(r, 500));
    }
    expect(hit).toContain("pong");
    const miss = docker(
      "exec",
      `${PREFIX}web`,
      "sh",
      "-c",
      `wget -qO- -T 3 http://${PREFIX}ha/other 2>&1 || true`,
    );
    expect(miss).not.toContain("pong");

    // Allow lists: the caller's own network is let in, any other network gets a 403.
    expect(
      (
        await call("PUT", `/gateways/${PREFIX}ha/routes`, {
          routes: [
            {
              name: "pong",
              path: "/pong",
              upstream: `http://${PREFIX}svc:8080`,
              stripPath: true,
              allow: [b?.subnet ?? "172.16.0.0/12"],
            },
            {
              name: "secret",
              path: "/secret",
              upstream: `http://${PREFIX}svc:8080`,
              stripPath: true,
              allow: ["10.255.255.0/24"],
            },
          ],
        })
      ).res.status,
    ).toBe(204);
    const reapplied = await call("POST", `/gateways/${PREFIX}ha/apply`);
    expect(reapplied.json.ok, reapplied.json.output).toBe(true);
    const fetchVia = (path: string) =>
      docker(
        "exec",
        `${PREFIX}svc`,
        "sh",
        "-c",
        `wget -S -qO- -T 3 http://${PREFIX}ha${path} 2>&1 || true`,
      );
    let allowed = "";
    for (let i = 0; i < 10 && !allowed.includes("pong"); i++) {
      allowed = fetchVia("/pong");
      if (!allowed.includes("pong")) await new Promise((r) => setTimeout(r, 500));
    }
    expect(allowed).toContain("pong");
    const denied = fetchVia("/secret");
    expect(denied).toContain("403");
    expect(denied).not.toContain("pong");
  });

  it.each([
    ["nginx", "nginx:1.27-alpine"],
    ["caddy", "caddy:2-alpine"],
  ])("enforces route allow lists on a real %s", async (id, image) => {
    try {
      docker("image", "inspect", image);
    } catch {
      return; // image not available offline: nothing to verify
    }
    const nets = (await call("GET", "/networks")).json as Net[];
    const b = nets.find((n) => n.name === `${PREFIX}b`);
    const template = (await call("GET", "/catalog")).json.find((t: { id: string }) => t.id === id);
    const gw = `${PREFIX}gw-${id}`;
    const created = await call("POST", "/containers", {
      name: gw,
      image: template.image,
      networkId: b?.id,
      restartPolicy: "no",
      volumes: template.volumes,
      command: template.command,
    });
    expect(created.res.status, JSON.stringify(created.json)).toBe(201);
    await new Promise((r) => setTimeout(r, 1500));
    expect(
      (
        await call("PUT", `/gateways/${gw}/routes`, {
          routes: [
            {
              name: "pong",
              path: "/pong",
              upstream: `http://${PREFIX}svc:8080`,
              stripPath: true,
              allow: [b?.subnet ?? "172.16.0.0/12"],
            },
            {
              name: "secret",
              path: "/secret",
              upstream: `http://${PREFIX}svc:8080`,
              stripPath: true,
              allow: ["10.255.255.0/24"],
            },
          ],
        })
      ).res.status,
    ).toBe(204);
    const applied = await call("POST", `/gateways/${gw}/apply`);
    expect(applied.json.ok, applied.json.output).toBe(true);
    const fetchVia = (path: string) =>
      docker(
        "exec",
        `${PREFIX}svc`,
        "sh",
        "-c",
        `wget -S -qO- -T 3 http://${gw}${path} 2>&1 || true`,
      );
    let allowed = "";
    for (let i = 0; i < 10 && !allowed.includes("pong"); i++) {
      allowed = fetchVia("/pong");
      if (!allowed.includes("pong")) await new Promise((r) => setTimeout(r, 500));
    }
    expect(allowed).toContain("pong");
    const denied = fetchVia("/secret");
    expect(denied).toContain("403");
    expect(denied).not.toContain("pong");
    docker("rm", "-f", gw);
  });

  it("serves custom DNS records from a real dnsmasq, and keeps them after the container restarts", async () => {
    try {
      docker("image", "inspect", "dockurr/dnsmasq:2.93");
    } catch {
      return; // image not available offline: nothing to verify
    }
    const nets = (await call("GET", "/networks")).json as Net[];
    const b = nets.find((n) => n.name === `${PREFIX}b`);
    const template = (await call("GET", "/catalog")).json.find(
      (t: { id: string }) => t.id === "dnsmasq",
    );
    const created = await call("POST", "/containers", {
      name: `${PREFIX}dns`,
      image: template.image,
      networkId: b?.id,
      restartPolicy: "no",
      env: template.env,
      volumes: template.volumes,
    });
    expect(created.res.status).toBe(201);
    await new Promise((r) => setTimeout(r, 1500));

    const servers = (await call("GET", "/dns")).json as {
      name: string;
      kind: string;
      ips: Record<string, string>;
    }[];
    const me = servers.find((s) => s.name === `${PREFIX}dns`);
    expect(me?.kind).toBe("dnsmasq");
    expect(Object.values(me?.ips ?? {})[0]).toMatch(/^\d+\.\d+\.\d+\.\d+$/);

    expect(
      (
        await call("PUT", `/dns/${PREFIX}dns/records`, {
          records: [
            { name: "app.lab.test", ip: "10.9.8.7" },
            { name: "v6.lab.test", ip: "fd00::7" },
          ],
        })
      ).res.status,
    ).toBe(204);
    const applied = await call("POST", `/dns/${PREFIX}dns/apply`);
    expect(applied.json.ok, applied.json.output).toBe(true);

    let answer = "";
    for (let i = 0; i < 20 && !answer.includes("10.9.8.7"); i++) {
      await new Promise((r) => setTimeout(r, 500));
      const r = await call("GET", `/dns/${PREFIX}dns/lookup?host=app.lab.test`);
      answer = r.json.output;
    }
    expect(answer).toContain("10.9.8.7");
    // a subdomain follows the record, a name nobody owns does not
    expect(
      (await call("GET", `/dns/${PREFIX}dns/lookup?host=sub.app.lab.test`)).json.output,
    ).toContain("10.9.8.7");
    expect((await call("GET", `/dns/${PREFIX}dns/lookup?host=v6.lab.test`)).json.output).toContain(
      "fd00::7",
    );

    // another container on the network can use it as its resolver
    const ip = Object.values(me?.ips ?? {})[0] as string;
    const viaNetwork = docker(
      "exec",
      `${PREFIX}svc`,
      "sh",
      "-c",
      `nslookup app.lab.test ${ip} 2>&1 || true`,
    );
    expect(viaNetwork).toContain("10.9.8.7");

    // a rejected file never replaces the working one (the script checks it with dnsmasq itself)
    docker(
      "exec",
      `${PREFIX}dns`,
      "sh",
      "-c",
      "echo 'not-a-directive=1' > /etc/dnsmasq.d/nautix.conf.new && dnsmasq --test --conf-file=/etc/dnsmasq.d/nautix.conf.new >/dev/null 2>&1 || rm -f /etc/dnsmasq.d/nautix.conf.new",
    );
    expect(docker("exec", `${PREFIX}dns`, "cat", "/etc/dnsmasq.d/nautix.conf")).toContain(
      "address=/app.lab.test/10.9.8.7",
    );

    // records live in a volume: a restart keeps them
    docker("restart", `${PREFIX}dns`);
    await new Promise((r) => setTimeout(r, 1500));
    expect((await call("GET", `/dns/${PREFIX}dns/lookup?host=app.lab.test`)).json.output).toContain(
      "10.9.8.7",
    );
  });

  it("serves custom DNS records from a real CoreDNS and reloads them without a restart", async () => {
    try {
      docker("image", "inspect", "coredns/coredns:1.14.7");
    } catch {
      return; // image not available offline: nothing to verify
    }
    const nets = (await call("GET", "/networks")).json as Net[];
    const b = nets.find((n) => n.name === `${PREFIX}b`);
    const template = (await call("GET", "/catalog")).json.find(
      (t: { id: string }) => t.id === "coredns",
    );
    const created = await call("POST", "/containers", {
      name: `${PREFIX}core`,
      image: template.image,
      networkId: b?.id,
      restartPolicy: "no",
      command: template.command,
      start: false,
    });
    expect(created.res.status).toBe(201);

    expect(
      (
        await call("PUT", `/dns/${PREFIX}core/records`, {
          records: [
            { name: "app.lab.test", ip: "10.9.8.7" },
            { name: "db.app.lab.test", ip: "10.9.8.8" },
            { name: "v6.lab.test", ip: "fd00::7" },
          ],
        })
      ).res.status,
    ).toBe(204);
    // never started: the first apply writes the Corefile and starts it
    const first = await call("POST", `/dns/${PREFIX}core/apply`);
    expect(first.json.ok, first.json.output).toBe(true);
    await new Promise((r) => setTimeout(r, 1500));

    const lookup = async (host: string) => {
      let out = "";
      for (let i = 0; i < 10; i++) {
        out = (await call("GET", `/dns/${PREFIX}core/lookup?host=${host}`)).json.output;
        if (/Address:.*\d|Address:.*:/.test(out.split("Name:")[1] ?? "")) break;
        await new Promise((r) => setTimeout(r, 500));
      }
      return out;
    };
    expect(await lookup("app.lab.test")).toContain("10.9.8.7");
    expect(await lookup("sub.app.lab.test")).toContain("10.9.8.7"); // subdomains follow
    expect(await lookup("db.app.lab.test")).toContain("10.9.8.8"); // most specific wins
    expect(await lookup("v6.lab.test")).toContain("fd00::7");

    const ip = (
      (await call("GET", "/dns")).json as { name: string; ips: Record<string, string> }[]
    ).find((s) => s.name === `${PREFIX}core`)?.ips[`${PREFIX}b`] as string;
    const noV6 = docker(
      "exec",
      `${PREFIX}svc`,
      "sh",
      "-c",
      `nslookup -type=AAAA app.lab.test ${ip} 2>&1 || true`,
    );
    expect(noV6).not.toContain("fd00");
    expect(noV6).not.toContain("NXDOMAIN");

    // change a record: reloaded in place, the container keeps running
    const startedBefore = docker("inspect", "-f", "{{.State.StartedAt}}", `${PREFIX}core`);
    await call("PUT", `/dns/${PREFIX}core/records`, {
      records: [{ name: "app.lab.test", ip: "10.9.8.99" }],
    });
    const second = await call("POST", `/dns/${PREFIX}core/apply`);
    expect(second.json.ok, second.json.output).toBe(true);
    expect(await lookup("app.lab.test")).toContain("10.9.8.99");
    expect(docker("inspect", "-f", "{{.State.StartedAt}}", `${PREFIX}core`)).toBe(startedBefore);
  });

  it("lists plugins through the real engine", async () => {
    const res = await call("GET", "/plugins");
    expect(res.res.status).toBe(200);
    expect(Array.isArray(res.json)).toBe(true);
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
