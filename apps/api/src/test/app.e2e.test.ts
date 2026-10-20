import "reflect-metadata";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import Database from "better-sqlite3";
import cookieParser from "cookie-parser";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { AppModule } from "../app.module.js";
import type { AppConfig } from "../shared/config.js";
import { ProblemFilter } from "../shared/problem.filter.js";

let app: INestApplication;
let base: string;
let dataDir: string;
let setupToken = "";
let cookie = "";
let restarts = 0;

const call = async (method: string, path: string, body?: unknown, withCookie = true) => {
  const res = await fetch(`${base}/api/v1${path}`, {
    method,
    headers: {
      "x-nautix-csrf": "1",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(withCookie && cookie ? { cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return {
    res,
    json: res.headers.get("content-type")?.includes("json") ? await res.json() : undefined,
  };
};

beforeAll(async () => {
  process.env.NAUTIX_LOGIN_RATE = "1000"; // this suite signs in many times from one address
  dataDir = mkdtempSync(join(tmpdir(), "nautix-"));
  const config: AppConfig = {
    host: "127.0.0.1",
    port: 0,
    dataDir,
    engine: "fake",
    dockerSocket: "",
    webDist: "",
    secureCookies: false,
    tls: { mode: "off" },
  };
  const logs: string[] = [];
  vi.spyOn(console, "log").mockImplementation((m: string) => logs.push(String(m)));
  restarts = 0;
  app = await NestFactory.create(
    AppModule.register(config, undefined, {
      restartSoon: () => {
        restarts++;
      },
    }),
    { logger: false },
  );
  app.use(cookieParser());
  app.useGlobalFilters(new ProblemFilter());
  await app.listen(0, "127.0.0.1");
  const address = app.getHttpServer().address() as { port: number };
  base = `http://127.0.0.1:${address.port}`;
  setupToken = logs.join("\n").match(/\(one-time\): (\S+)/)?.[1] ?? "";
});

afterAll(async () => {
  await app.close();
  rmSync(dataDir, { recursive: true, force: true });
});

describe("auth", () => {
  it("rejects anonymous access and mutations without the CSRF header", async () => {
    expect((await call("GET", "/containers", undefined, false)).res.status).toBe(401);
    const res = await fetch(`${base}/api/v1/auth/login`, { method: "POST" });
    expect(res.status).toBe(403);
  });

  it("requires the setup token, then logs in", async () => {
    expect(setupToken).not.toBe("");
    const bad = await call("POST", "/auth/setup", {
      setupToken: "nope",
      username: "admin",
      password: "correct-horse-1",
    });
    expect(bad.res.status).toBe(403);
    expect(
      (
        await call("POST", "/auth/setup", {
          setupToken,
          username: "admin",
          password: "correct-horse-1",
        })
      ).res.status,
    ).toBe(204);
    expect(
      (
        await call("POST", "/auth/setup", {
          setupToken,
          username: "second",
          password: "correct-horse-1",
        })
      ).res.status,
    ).toBe(409);

    const wrong = await call("POST", "/auth/login", {
      username: "admin",
      password: "wrong-password",
    });
    expect(wrong.res.status).toBe(401);
    expect(wrong.json.hintKey).toBe("errors.invalidCredentials");

    const ok = await call("POST", "/auth/login", {
      username: "admin",
      password: "correct-horse-1",
    });
    expect(ok.res.status).toBe(204);
    const setCookie = ok.res.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Strict/i);
    cookie = setCookie.split(";")[0] ?? "";
    expect((await call("GET", "/auth/session")).json.authenticated).toBe(true);
  });
});

describe("docker api (fake engine)", () => {
  it("deploys into a network box and keeps published ports on loopback", async () => {
    const networks = (await call("GET", "/networks")).json as { id: string; name: string }[];
    const backend = networks.find((n) => n.name === "backend");
    expect(backend).toBeDefined();
    const created = await call("POST", "/containers", {
      name: "api-test",
      image: "nginx:1.27-alpine",
      networkId: backend?.id,
      ports: [{ containerPort: 80, hostPort: 18080 }],
    });
    expect(created.res.status).toBe(201);
    const list = (await call("GET", "/containers")).json as {
      name: string;
      ports: { ip: string }[];
      networks: string[];
      state: string;
    }[];
    const c = list.find((x) => x.name === "api-test");
    expect(c?.networks).toEqual(["backend"]);
    expect(c?.ports[0]?.ip).toBe("127.0.0.1");
    expect(c?.state).toBe("running");
  });

  it("returns problem+json with a hint key for conflicts", async () => {
    const dup = await call("POST", "/containers", {
      name: "api-test",
      image: "nginx",
      networkId: null,
    });
    expect(dup.res.status).toBe(409);
    expect(dup.res.headers.get("content-type")).toContain("application/problem+json");
    expect(dup.json.hintKey).toBe("errors.nameInUse");
  });

  it("exports the canvas as Compose without leaking env values", async () => {
    await call("POST", "/containers", {
      name: "exp-db",
      image: "postgres:16-alpine",
      networkId: null,
      env: { POSTGRES_PASSWORD: "topsecret" },
    });
    const { json } = await call("GET", "/export/compose");
    expect(json.yaml).toContain("exp-db:");
    expect(json.yaml).toContain("POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}");
    expect(json.yaml).not.toContain("topsecret");
    const withEnv = await call("GET", "/export/compose?includeEnv=true");
    expect(withEnv.json.yaml).toContain("topsecret");
  });

  it("locks the container that runs Nautix: nobody can stop, remove, rewire or open a shell in it", async () => {
    const list = (await call("GET", "/containers")).json as {
      id: string;
      name: string;
      isSelf?: boolean;
    }[];
    const self = list.find((c) => c.isSelf);
    expect(self?.name).toBe("nautix");
    const networks = (await call("GET", "/networks")).json as { id: string; name: string }[];
    const edge = networks.find((n) => n.name === "edge");

    for (const action of ["stop", "kill", "restart", "pause"]) {
      const refused = await call("POST", `/containers/${self?.id}/${action}`);
      expect(refused.res.status).toBe(403);
      expect(refused.json.hintKey).toBe("errors.selfLocked");
    }
    expect((await call("DELETE", `/containers/${self?.id}?force=true`)).res.status).toBe(403);
    expect(
      (await call("POST", `/networks/${edge?.id}/connect`, { containerId: self?.id })).res.status,
    ).toBe(403);
    expect(
      (await call("POST", `/networks/${edge?.id}/disconnect`, { containerId: self?.id })).res
        .status,
    ).toBe(403);
    expect(await openTerminalOn(self?.id ?? "", { origin: base, cookie })).toBe("403");
    // Harmless actions still work, and the container is untouched.
    expect((await call("POST", `/containers/${self?.id}/start`)).res.status).toBe(204);
    const after = (await call("GET", "/containers")).json as { id: string; state: string }[];
    expect(after.find((c) => c.id === self?.id)?.state).toBe("running");
  });

  it("validates input", async () => {
    const bad = await call("POST", "/networks", { name: "bad name!" });
    expect(bad.res.status).toBe(422);
  });

  it("does not remove a network that still has containers", async () => {
    const networks = (await call("GET", "/networks")).json as { id: string; name: string }[];
    const backend = networks.find((n) => n.name === "backend");
    expect((await call("DELETE", `/networks/${backend?.id}`)).res.status).toBe(409);
  });
});

describe("events stream", () => {
  it("pushes a change event when a resource is mutated", async () => {
    const abort = new AbortController();
    const res = await fetch(`${base}/api/v1/events`, { headers: { cookie }, signal: abort.signal });
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const reader = res.body?.getReader();
    const decoder = new TextDecoder();
    await new Promise((r) => setTimeout(r, 100));
    await call("POST", "/volumes", { name: "events-vol" });
    let text = "";
    while (!text.includes("volume")) {
      const chunk = await reader?.read();
      if (!chunk || chunk.done) break;
      text += decoder.decode(chunk.value);
    }
    abort.abort();
    expect(text).toContain('"kind":"volume"');
  });
});

describe("terminal websocket", () => {
  const open = (containerId: string, headers: Record<string, string>) =>
    new Promise<{ ws: WebSocket; error?: string }>((resolve) => {
      const ws = new WebSocket(
        `${base.replace("http", "ws")}/ws/terminal/${containerId}?cols=80&rows=24`,
        { headers },
      );
      ws.on("open", () => resolve({ ws }));
      ws.on("unexpected-response", (_req, res) => resolve({ ws, error: String(res.statusCode) }));
      ws.on("error", () => undefined);
    });

  it("refuses connections without a session or with a foreign origin", async () => {
    const host = new URL(base).host;
    expect((await open("abc", { origin: `http://${host}` })).error).toBe("401");
    expect((await open("abc", { origin: "http://evil.example", cookie })).error).toBe("403");
  });

  it("bridges a shell session for an authenticated same-origin client", async () => {
    const { ws, error } = await open("abc", { origin: base, cookie });
    expect(error).toBeUndefined();
    const chunks: string[] = [];
    ws.on("message", (d: Buffer) => chunks.push(d.toString()));
    await new Promise((r) => setTimeout(r, 50));
    ws.send(Buffer.from("hi\r"));
    await new Promise((r) => setTimeout(r, 100));
    ws.close();
    expect(chunks.join("")).toContain("you typed: hi");
  });
});

const openTerminalOn = (containerId: string, headers: Record<string, string>) =>
  new Promise<string | undefined>((resolve) => {
    const ws = new WebSocket(
      `${base.replace("http", "ws")}/ws/terminal/${containerId}?cols=80&rows=24`,
      {
        headers,
      },
    );
    ws.on("open", () => {
      ws.close();
      resolve(undefined);
    });
    ws.on("unexpected-response", (_req, res) => resolve(String(res.statusCode)));
    ws.on("error", () => undefined);
  });

describe("roles and API tokens", () => {
  const bearer = (token: string, method = "GET", path = "/containers", body?: unknown) =>
    fetch(`${base}/api/v1${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

  it("creates API tokens shown once, usable without CSRF, revocable", async () => {
    const created = await call("POST", "/settings/tokens", { name: "ci", role: "admin" });
    expect(created.res.status).toBe(201);
    const { id, token } = created.json as { id: string; token: string };
    expect(token).toMatch(/^nx_/);

    const list = (await call("GET", "/settings/tokens")).json as Record<string, unknown>[];
    expect(JSON.stringify(list)).not.toContain(token);
    expect(list[0]).not.toHaveProperty("tokenHash");

    expect((await bearer(token)).status).toBe(200);
    expect((await bearer(token, "POST", "/volumes", { name: "from-token" })).status).toBe(204);
    expect((await bearer("nx_bogus")).status).toBe(401);

    expect((await call("DELETE", `/settings/tokens/${id}`)).res.status).toBe(204);
    expect((await bearer(token)).status).toBe(401);
  });

  it("makes viewers read-only and keeps secrets and terminals away from them", async () => {
    const made = await call("POST", "/settings/users", {
      username: "viewer1",
      password: "correct-horse-2",
      role: "viewer",
    });
    expect(made.res.status).toBe(201);

    const login = await call(
      "POST",
      "/auth/login",
      { username: "viewer1", password: "correct-horse-2" },
      false,
    );
    const viewerCookie = (login.res.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
    const asViewer = (method: string, path: string, body?: unknown) =>
      fetch(`${base}/api/v1${path}`, {
        method,
        headers: {
          cookie: viewerCookie,
          "x-nautix-csrf": "1",
          ...(body ? { "content-type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });

    expect((await asViewer("GET", "/containers")).status).toBe(200);
    const write = await asViewer("POST", "/volumes", { name: "nope" });
    expect(write.status).toBe(403);
    expect(((await write.json()) as { hintKey: string }).hintKey).toBe("errors.readOnly");
    expect((await asViewer("GET", "/export/compose")).status).toBe(200);
    expect((await asViewer("GET", "/export/compose?includeEnv=true")).status).toBe(403);
    expect((await asViewer("GET", "/settings/users")).status).toBe(403);
    expect((await asViewer("GET", "/settings/tokens")).status).toBe(403);

    expect(await openTerminalOn("abc", { origin: base, cookie: viewerCookie })).toBe("403");
  });

  it("will not delete yourself or the last admin", async () => {
    const users = (await call("GET", "/settings/users")).json as { id: string; username: string }[];
    const admin = users.find((u) => u.username === "admin");
    const refused = await call("DELETE", `/settings/users/${admin?.id}`);
    expect(refused.res.status).toBe(409);
    expect(refused.json.hintKey).toBe("errors.deleteSelf");
    const viewer = users.find((u) => u.username === "viewer1");
    expect((await call("DELETE", `/settings/users/${viewer?.id}`)).res.status).toBe(204);
  });
});

describe("layout", () => {
  it("persists canvas positions and rejects junk", async () => {
    expect((await call("GET", "/layout")).json).toEqual({ zones: {}, nodes: {} });
    const layout = { zones: { backend: { x: 10, y: 20 } }, nodes: { kong: { x: 30, y: 80 } } };
    expect((await call("PUT", "/layout", layout)).res.status).toBe(204);
    expect((await call("GET", "/layout")).json).toEqual(layout);
    expect(
      (await call("PUT", "/layout", { zones: { a: { x: "no", y: 1 } }, nodes: {} })).res.status,
    ).toBe(422);
    expect(
      (await call("PUT", "/layout", { zones: {}, nodes: { a: { x: 1e12, y: 0 } } })).res.status,
    ).toBe(422);
  });
});

describe("compose projects", () => {
  const GOOD = "services:\n  web:\n    image: nginx\n    ports: ['127.0.0.1:8081:80']\n";
  const RISKY =
    "services:\n  agent:\n    image: x\n    volumes: ['/var/run/docker.sock:/var/run/docker.sock']\n";

  it("saves, lists, reads and runs a project", async () => {
    expect((await call("PUT", "/compose/projects/demo", { content: GOOD })).res.status).toBe(204);
    const list = (await call("GET", "/compose/projects")).json as { name: string }[];
    expect(list.map((p) => p.name)).toContain("demo");
    expect(
      ((await call("GET", "/compose/projects/demo")).json as { content: string }).content,
    ).toBe(GOOD);
    const up = await call("POST", "/compose/projects/demo/up", {});
    expect(up.res.status).toBe(200);
    expect(up.json).toMatchObject({ ok: true, exitCode: 0 });
  });

  it("refuses invalid names, invalid files and unacknowledged risks", async () => {
    expect((await call("PUT", "/compose/projects/Bad_Name", { content: GOOD })).res.status).toBe(
      422,
    );
    await call("PUT", "/compose/projects/broken", { content: "services:\n  a: {}\n" });
    const invalid = await call("POST", "/compose/projects/broken/up", {});
    expect(invalid.res.status).toBe(422);
    expect(invalid.json.hintKey).toBe("errors.composeInvalid");

    await call("PUT", "/compose/projects/risky", { content: RISKY });
    const refused = await call("POST", "/compose/projects/risky/up", {});
    expect(refused.res.status).toBe(409);
    expect(refused.json.hintKey).toBe("errors.composeRisk");
    expect(
      (await call("POST", "/compose/projects/risky/up", { acknowledgeRisks: true })).res.status,
    ).toBe(200);
  });

  it("lets `down` run even when the file is invalid, and deletes projects", async () => {
    expect((await call("POST", "/compose/projects/broken/down", {})).res.status).toBe(200);
    expect((await call("DELETE", "/compose/projects/broken")).res.status).toBe(204);
    expect((await call("GET", "/compose/projects/broken")).res.status).toBe(404);
  });
});

describe("catalog", () => {
  const list = async () =>
    (await call("GET", "/catalog")).json as {
      id: string;
      custom?: boolean;
      env?: Record<string, string>;
    }[];

  it("ships SQL Server, Kafka and n8n", async () => {
    const ids = (await list()).map((t) => t.id);
    expect(ids).toEqual(
      expect.arrayContaining(["mssql", "kafka", "n8n", "adguardhome", "pihole", "dnsmasq"]),
    );
  });

  it("saves, updates and deletes the user's own templates", async () => {
    const body = {
      name: "Mi API",
      image: "ghcr.io/acme/api:1.0",
      ports: [{ containerPort: 8080 }],
      env: { MODE: "dev" },
      volumes: ["/data"],
    };
    const saved = await call("POST", "/catalog/custom", body);
    expect(saved.res.status).toBe(201);
    expect(saved.json).toMatchObject({ id: "custom-mi-api", custom: true, category: "custom" });

    await call("POST", "/catalog/custom", { ...body, env: { MODE: "prod" } });
    const mine = (await list()).filter((t) => t.custom);
    expect(mine).toHaveLength(1);
    expect(mine[0]?.env).toEqual({ MODE: "prod" });

    expect((await call("POST", "/catalog/custom", { name: "", image: "x" })).res.status).toBe(422);
    expect((await call("DELETE", "/catalog/custom/custom-mi-api")).res.status).toBe(204);
    expect((await list()).filter((t) => t.custom)).toHaveLength(0);
  });
});

describe("tunnels", () => {
  it("forwards one port between two networks and is removable like any container", async () => {
    const networks = (await call("GET", "/networks")).json as { id: string; name: string }[];
    const containers = (await call("GET", "/containers")).json as { id: string; name: string }[];
    const edge = networks.find((n) => n.name === "edge");
    const backend = networks.find((n) => n.name === "backend");
    const db = containers.find((c) => c.name === "postgres");

    const created = await call("POST", "/tunnels", {
      fromNetworkId: edge?.id,
      toNetworkId: backend?.id,
      targetContainerId: db?.id,
      targetPort: 5432,
    });
    expect(created.res.status).toBe(201);

    const after = (await call("GET", "/containers")).json as {
      id: string;
      name: string;
      state: string;
      networks: string[];
      labels: Record<string, string>;
      ports: unknown[];
    }[];
    const tunnel = after.find((c) => c.labels["nautix.tunnel"] === "true");
    expect(tunnel?.name).toBe("tunnel-edge-to-backend-5432");
    expect(tunnel?.networks.sort()).toEqual(["backend", "edge"]);
    expect(tunnel?.state).toBe("running");
    expect(tunnel?.labels["nautix.tunnel.target"]).toBe("postgres:5432");
    expect(tunnel?.ports).toEqual([]); // nothing is published to the host

    const duplicate = await call("POST", "/tunnels", {
      fromNetworkId: edge?.id,
      toNetworkId: backend?.id,
      targetContainerId: db?.id,
      targetPort: 5432,
    });
    expect(duplicate.res.status).toBe(409);
    const wrongSide = await call("POST", "/tunnels", {
      fromNetworkId: backend?.id,
      toNetworkId: edge?.id,
      targetContainerId: db?.id,
      targetPort: 5432,
    });
    expect(wrongSide.res.status).toBe(422);

    expect((await call("DELETE", `/containers/${tunnel?.id}?force=true`)).res.status).toBe(204);
  });
});

describe("udp ports", () => {
  it("publishes DNS on 53/udp and 53/tcp, bound to loopback", async () => {
    const created = await call("POST", "/containers", {
      name: "dns-test",
      image: "adguard/adguardhome:v0.107.78",
      networkId: null,
      ports: [
        { containerPort: 53, protocol: "udp", hostPort: 5353 },
        { containerPort: 53, protocol: "tcp", hostPort: 5353 },
      ],
    });
    expect(created.res.status).toBe(201);
    const list = (await call("GET", "/containers")).json as {
      name: string;
      ports: { type: string; ip?: string; publicPort?: number }[];
    }[];
    const ports = list.find((c) => c.name === "dns-test")?.ports ?? [];
    expect(ports.map((p) => p.type).sort()).toEqual(["tcp", "udp"]);
    expect(ports.every((p) => p.ip === "127.0.0.1" && p.publicPort === 5353)).toBe(true);
  });
});

describe("container details (docker inspect/stats/top/diff/rename/update/wait/commit/export/cp)", () => {
  let id = "";

  it("reads inspect, stats, top and diff", async () => {
    await call("POST", "/containers", {
      name: "detail-app",
      image: "nginx",
      networkId: null,
      env: { SECRET: "hunter2" },
    });
    const list = (await call("GET", "/containers")).json as { id: string; name: string }[];
    id = list.find((c) => c.name === "detail-app")?.id ?? "";
    const inspect = (await call("GET", `/containers/${id}/inspect`)).json as {
      Config: { Env: string[] };
    };
    expect(inspect.Config.Env).toContain("SECRET=hunter2");
    expect(
      ((await call("GET", `/containers/${id}/stats`)).json as { pids: number }).pids,
    ).toBeGreaterThan(0);
    expect(
      ((await call("GET", `/containers/${id}/top`)).json as { titles: string[] }).titles,
    ).toContain("PID");
    expect(
      ((await call("GET", `/containers/${id}/diff`)).json as { kind: string }[]).map((c) => c.kind),
    ).toContain("added");
  });

  it("renames, updates and waits", async () => {
    expect(
      (await call("POST", `/containers/${id}/rename`, { name: "detail-renamed" })).res.status,
    ).toBe(204);
    expect((await call("POST", `/containers/${id}/rename`, { name: "bad name!" })).res.status).toBe(
      422,
    );
    expect(
      (
        await call("POST", `/containers/${id}/update`, {
          restartPolicy: "no",
          memoryMb: 256,
          cpus: 0.5,
        })
      ).res.status,
    ).toBe(204);
    const wait = await call("POST", `/containers/${id}/wait?timeout=1`);
    expect(wait.json).toEqual({ exited: false, statusCode: null });
    await call("POST", `/containers/${id}/stop?timeout=1`);
    expect((await call("POST", `/containers/${id}/wait?timeout=1`)).json).toEqual({
      exited: true,
      statusCode: 0,
    });
    expect((await call("POST", `/containers/${id}/kill?signal=SIGBOGUS`)).res.status).toBe(422);
    expect((await call("POST", `/containers/${id}/kill?signal=SIGTERM`)).res.status).toBe(204);
  });

  it("commits to an image and exports/copies as tar (admin only)", async () => {
    const commit = await call("POST", `/containers/${id}/commit`, {
      repository: "snap/app",
      tag: "v1",
    });
    expect(commit.res.status).toBe(201);
    const images = (await call("GET", "/images")).json as { tags: string[] }[];
    expect(images.flatMap((i) => i.tags)).toContain("snap/app:v1");

    const exported = await fetch(`${base}/api/v1/containers/${id}/export`, { headers: { cookie } });
    expect(exported.headers.get("content-type")).toBe("application/x-tar");
    expect(await exported.text()).toContain("FAKE-TAR");
    const archive = await fetch(
      `${base}/api/v1/containers/${id}/archive?path=${encodeURIComponent("/etc")}`,
      { headers: { cookie } },
    );
    expect(await archive.text()).toContain("/etc");
    expect((await call("GET", `/containers/${id}/archive?path=relative`)).res.status).toBe(422);

    const put = await fetch(
      `${base}/api/v1/containers/${id}/archive?path=${encodeURIComponent("/tmp")}`,
      {
        method: "PUT",
        headers: { cookie, "x-nautix-csrf": "1", "content-type": "application/x-tar" },
        body: Buffer.from("tar-bytes"),
      },
    );
    expect(put.status).toBe(204);
  });

  it("keeps the Nautix container out of rename, update, commit, export and cp", async () => {
    const self = (
      (await call("GET", "/containers")).json as { id: string; isSelf?: boolean }[]
    ).find((c) => c.isSelf);
    expect((await call("POST", `/containers/${self?.id}/rename`, { name: "x" })).res.status).toBe(
      403,
    );
    expect(
      (await call("POST", `/containers/${self?.id}/update`, { restartPolicy: "no" })).res.status,
    ).toBe(403);
    expect(
      (await call("POST", `/containers/${self?.id}/commit`, { repository: "leak/self" })).res
        .status,
    ).toBe(403);
    expect(
      (await fetch(`${base}/api/v1/containers/${self?.id}/export`, { headers: { cookie } })).status,
    ).toBe(403);
    expect(
      (
        await fetch(`${base}/api/v1/containers/${self?.id}/archive?path=/data`, {
          headers: { cookie },
        })
      ).status,
    ).toBe(403);
  });

  it("redacts env in inspect for read-only users", async () => {
    await call("POST", "/settings/users", {
      username: "viewer2",
      password: "correct-horse-3",
      role: "viewer",
    });
    const login = await call(
      "POST",
      "/auth/login",
      { username: "viewer2", password: "correct-horse-3" },
      false,
    );
    const viewerCookie = (login.res.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
    const inspect = (await (
      await fetch(`${base}/api/v1/containers/${id}/inspect`, { headers: { cookie: viewerCookie } })
    ).json()) as { Config: { Env: string[] } };
    expect(inspect.Config.Env).toContain("SECRET=<hidden>");
    expect(inspect.Config.Env.join()).not.toContain("hunter2");
    expect(
      (await fetch(`${base}/api/v1/containers/${id}/export`, { headers: { cookie: viewerCookie } }))
        .status,
    ).toBe(403);
  });
});

describe("image tools and system commands", () => {
  const raw = (method: string, path: string, body: Buffer, type = "application/x-tar") =>
    fetch(`${base}/api/v1${path}`, {
      method,
      headers: { cookie, "x-nautix-csrf": "1", "content-type": type },
      body: new Uint8Array(body),
    });

  it("tags, shows history, searches, saves, loads and imports", async () => {
    expect(
      (
        await call("POST", "/images/tag", {
          reference: "nginx:1.27-alpine",
          repository: "myorg/web",
          tag: "v1",
        })
      ).res.status,
    ).toBe(204);
    const images = (await call("GET", "/images")).json as { tags: string[] }[];
    expect(images.flatMap((i) => i.tags)).toContain("myorg/web:v1");
    expect(
      (await call("POST", "/images/tag", { reference: "bad ref!", repository: "x", tag: "y" })).res
        .status,
    ).toBe(422);

    const history = (
      await call("GET", `/images/history?ref=${encodeURIComponent("nginx:1.27-alpine")}`)
    ).json as { createdBy: string }[];
    expect(history.length).toBeGreaterThan(0);
    const search = (await call("GET", "/images/search?term=nginx")).json as {
      name: string;
      official: boolean;
    }[];
    expect(search.map((r) => r.name)).toContain("nginx");

    const saved = await fetch(
      `${base}/api/v1/images/save?ref=${encodeURIComponent("nginx:1.27-alpine")}`,
      { headers: { cookie } },
    );
    expect(saved.headers.get("content-type")).toBe("application/x-tar");
    expect(await saved.text()).toContain("FAKE-IMAGE-TAR");

    const loaded = await raw("POST", "/images/load", Buffer.from("tar"));
    expect(((await loaded.json()) as { output: string }).output).toContain("Loaded image");
    const imported = await raw(
      "POST",
      "/images/import?repository=rootfs/demo&tag=1",
      Buffer.from("tar"),
    );
    expect(imported.status).toBe(201);
    const after = (await call("GET", "/images")).json as { tags: string[] }[];
    expect(after.flatMap((i) => i.tags)).toContain("rootfs/demo:1");
  });

  it("pushes with one-off credentials and tests a registry login", async () => {
    await call("POST", "/images/tag", {
      reference: "nginx:1.27-alpine",
      repository: "private/app",
      tag: "1",
    });
    expect((await call("POST", "/images/push", { reference: "private/app:1" })).res.status).toBe(
      422,
    );
    const pushed = await call("POST", "/images/push", {
      reference: "private/app:1",
      auth: { username: "u", password: "p" },
    });
    expect((pushed.json as { output: string }).output).toContain("digest");
    expect(JSON.stringify(pushed.json)).not.toContain('"p"');
    expect(
      (await call("POST", "/registries/test", { username: "u", password: "wrong" })).res.status,
    ).toBe(422);
    expect(
      (
        (await call("POST", "/registries/test", { username: "u", password: "ok" })).json as {
          status: string;
        }
      ).status,
    ).toBe("Login Succeeded");
  });

  it("keeps registry logins encrypted and uses them for push", async () => {
    expect(
      (
        await call("PUT", "/registries", {
          server: "https://index.docker.io/v1/",
          username: "me",
          password: "wrong",
        })
      ).res.status,
    ).toBe(422);
    expect(((await call("GET", "/registries")).json as unknown[]).length).toBe(0);

    const saved = await call("PUT", "/registries", {
      server: "https://index.docker.io/v1/",
      username: "me",
      password: "hunter2-secret",
    });
    expect(saved.json).toEqual({ server: "docker.io", username: "me" });
    expect((await call("GET", "/registries")).json).toEqual([
      { server: "docker.io", username: "me" },
    ]);
    expect(JSON.stringify((await call("GET", "/registries")).json)).not.toContain("hunter2");

    const db = new Database(join(dataDir, "nautix.db"), { readonly: true });
    const row = db.prepare("SELECT secret FROM registries").get() as { secret: string };
    db.close();
    expect(row.secret).not.toContain("hunter2");

    // No credentials in the request: the saved login for docker.io is used.
    const pushed = await call("POST", "/images/push", { reference: "private/app:1" });
    expect(pushed.res.status).toBe(201);

    expect((await call("DELETE", "/registries/docker.io")).res.status).toBe(204);
    expect((await call("DELETE", "/registries/docker.io")).res.status).toBe(404);
  });

  it("records who changed what, without bodies or secrets", async () => {
    await call("PUT", "/registries", {
      server: "ghcr.io",
      username: "audit-me",
      password: "p4ssw0rd-x",
    });
    const rows = (await call("GET", "/settings/audit?limit=50")).json as {
      actor: string;
      action: string;
      status: number;
    }[];
    expect(rows[0]).toMatchObject({
      actor: "admin",
      action: "PUT /api/v1/registries",
      status: 200,
    });
    expect(rows.some((r) => r.action.startsWith("POST /api/v1/auth/login"))).toBe(true);
    expect(JSON.stringify(rows)).not.toContain("p4ssw0rd-x");
    expect(rows.every((r) => !r.action.startsWith("GET"))).toBe(true);
    await call("DELETE", "/registries/ghcr.io");
  });

  it("downloads a backup and stages a restore without touching live data", async () => {
    const res = await fetch(`${base}/api/v1/settings/backup`, { headers: { cookie } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain("nautix-backup-");
    const archive = Buffer.from(await res.arrayBuffer());
    expect(archive.length).toBeGreaterThan(100);

    const bad = await fetch(`${base}/api/v1/settings/restore`, {
      method: "POST",
      headers: { cookie, "x-nautix-csrf": "1", "content-type": "application/gzip" },
      body: new Uint8Array(Buffer.from("nope")),
    });
    expect(bad.status).toBe(422);
    expect(restarts).toBe(0);

    const ok = await fetch(`${base}/api/v1/settings/restore`, {
      method: "POST",
      headers: { cookie, "x-nautix-csrf": "1", "content-type": "application/gzip" },
      body: new Uint8Array(archive),
    });
    expect(ok.status).toBe(202);
    expect(restarts).toBe(1);
    const trail = (await call("GET", "/settings/audit?limit=20")).json as { action: string }[];
    expect(trail.map((r) => r.action)).toEqual(
      expect.arrayContaining(["backup.download", "backup.restore"]),
    );
    rmSync(join(dataDir, "restore-pending"), { recursive: true, force: true });
  });

  it("builds an image from a typed Dockerfile and streams the output", async () => {
    const post = (body: unknown) =>
      fetch(`${base}/api/v1/builds`, {
        method: "POST",
        headers: { cookie, "x-nautix-csrf": "1", "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    const ok = await post({ tag: "demo/built:1", dockerfile: 'FROM alpine:3.20\nCMD ["sh"]\n' });
    expect(ok.status).toBe(200);
    const text = await ok.text();
    expect(text).toContain("Step 1/2");
    expect(text.trim().endsWith("NAUTIX-BUILD: ok")).toBe(true);
    const images = (await call("GET", "/images")).json as { tags: string[] }[];
    expect(images.some((i) => i.tags.includes("demo/built:1"))).toBe(true);

    const bad = await (
      await post({ tag: "demo/bad:1", dockerfile: "FROM alpine:3.20\nRUN BROKEN-STEP\n" })
    ).text();
    expect(bad).toContain("ERROR:");
    expect(bad.trim().endsWith("NAUTIX-BUILD: failed")).toBe(true);

    expect(
      (
        await post({
          tag: "demo/x:1",
          dockerfile: "FROM a",
          files: [{ path: "../etc/x", content: "" }],
        })
      ).status,
    ).toBe(422);
    expect((await post({ tag: "bad tag!", dockerfile: "FROM a" })).status).toBe(422);
  });

  it("manages a swarm: init, services, secrets, configs, nodes and stacks", async () => {
    expect(((await call("GET", "/swarm")).json as { active: boolean }).active).toBe(false);
    expect((await call("GET", "/swarm/services")).res.status).toBe(409);

    const init = await call("POST", "/swarm/init", {});
    expect(init.res.status).toBe(201);
    expect(
      (await call("GET", "/swarm")).json as { active: boolean; isManager: boolean },
    ).toMatchObject({ active: true, isManager: true });
    expect((await call("POST", "/swarm/init", {})).res.status).toBe(409);

    const tokens = (await call("GET", "/swarm/tokens")).json as { worker: string; manager: string };
    expect(tokens.worker).toMatch(/^SWMTKN-1-/);
    await call("POST", "/swarm/tokens/rotate", { target: "worker" });
    expect(((await call("GET", "/swarm/tokens")).json as { worker: string }).worker).not.toBe(
      tokens.worker,
    );

    const nodes = (await call("GET", "/swarm/nodes")).json as { id: string; role: string }[];
    expect(nodes).toHaveLength(1);
    expect(
      (await call("PATCH", `/swarm/nodes/${nodes[0]?.id}`, { availability: "drain" })).res.status,
    ).toBe(204);
    expect(
      ((await call("GET", "/swarm/nodes")).json as { availability: string }[])[0]?.availability,
    ).toBe("drain");

    const created = await call("POST", "/swarm/services", {
      name: "web",
      image: "nginx:1.27-alpine",
      replicas: 2,
      ports: [{ target: 80, published: 8080 }],
    });
    expect(created.res.status).toBe(201);
    expect((await call("POST", "/swarm/services", { name: "web", image: "x" })).res.status).toBe(
      409,
    );
    const id = (created.json as { id: string }).id;
    expect((await call("PATCH", `/swarm/services/${id}`, { replicas: 4 })).res.status).toBe(204);
    const services = (await call("GET", "/swarm/services")).json as {
      name: string;
      replicas: number;
      running: number;
    }[];
    expect(services[0]).toMatchObject({ name: "web", replicas: 4, running: 4 });
    expect(((await call("GET", `/swarm/services/${id}/tasks`)).json as unknown[]).length).toBe(4);
    expect(
      ((await call("GET", `/swarm/services/${id}/logs`)).json as { logs: string }).logs,
    ).toContain("web");

    expect(
      (await call("POST", "/swarm/secrets", { name: "db-pass", value: "s3cr3t-value" })).res.status,
    ).toBe(204);
    const secrets = await call("GET", "/swarm/secrets");
    expect(JSON.stringify(secrets.json)).not.toContain("s3cr3t-value");
    expect((secrets.json as { name: string }[])[0]?.name).toBe("db-pass");
    expect((await call("POST", "/swarm/secrets", { name: "db-pass", value: "x" })).res.status).toBe(
      409,
    );

    await call("POST", "/swarm/configs", { name: "app.conf", value: "listen 80;" });
    const configs = (await call("GET", "/swarm/configs")).json as { id: string }[];
    expect(
      ((await call("GET", `/swarm/configs/${configs[0]?.id}/data`)).json as { data: string }).data,
    ).toBe("listen 80;");

    expect(((await call("GET", "/swarm/stacks")).json as unknown[]).length).toBe(0);
    expect(
      (await call("POST", "/swarm/stacks", { name: "shop", yaml: "services: {}" })).res.status,
    ).toBe(201);
    expect((await call("POST", "/swarm/stacks", { name: "Bad Name", yaml: "x" })).res.status).toBe(
      422,
    );

    expect((await call("DELETE", `/swarm/services/${id}`)).res.status).toBe(204);
    expect(
      (await call("DELETE", `/swarm/secrets/${(secrets.json as { id: string }[])[0]?.id}`)).res
        .status,
    ).toBe(204);
    expect((await call("DELETE", `/swarm/configs/${configs[0]?.id}`)).res.status).toBe(204);
    expect((await call("POST", "/swarm/leave", { force: true })).res.status).toBe(204);
    expect(((await call("GET", "/swarm")).json as { active: boolean }).active).toBe(false);
  });

  it("browses a volume read-only through a throw-away helper", async () => {
    await call("POST", "/volumes", { name: "browse-me" });
    const dir = await call("GET", "/volumes/browse-me/browse?path=/");
    expect(dir.res.status).toBe(200);
    expect(dir.json.kind).toBe("directory");
    expect(dir.json.entries.map((e: { name: string }) => e.name)).toEqual(["data", "hello.txt"]);
    const file = await call("GET", "/volumes/browse-me/browse?path=/hello.txt&view=true");
    expect(file.json).toMatchObject({
      kind: "file",
      content: "hello from the volume\n",
      truncated: false,
    });
    expect((await call("GET", "/volumes/browse-me/browse?path=../etc")).res.status).toBe(422);
    expect((await call("GET", "/volumes/nope/browse")).res.status).toBe(404);
    const left = (
      (await call("GET", "/containers")).json as { labels: Record<string, string> }[]
    ).filter((c) => c.labels["nautix.helper"]);
    expect(left).toHaveLength(0);
    await call("DELETE", "/volumes/browse-me");
  });

  it("installs plugins only with the privileges the user accepted", async () => {
    const asks = (await call("GET", "/plugins/privileges?remote=vieux/sshfs")).json as {
      name: string;
      value: string[];
    }[];
    expect(asks.map((a) => a.name)).toEqual(["network", "mount"]);
    expect(
      (
        await call("POST", "/plugins", {
          remote: "vieux/sshfs",
          privileges: [{ name: "network", value: ["bridge"] }],
        })
      ).res.status,
    ).toBe(422);
    expect(
      (await call("POST", "/plugins", { remote: "vieux/sshfs", privileges: asks })).res.status,
    ).toBe(204);
    expect((await call("GET", "/plugins")).json as { name: string; enabled: boolean }[]).toEqual([
      expect.objectContaining({ name: "vieux/sshfs:latest", enabled: false }),
    ]);
    expect((await call("POST", "/plugins/vieux%2Fsshfs:latest/enable")).res.status).toBe(204);
    expect((await call("DELETE", "/plugins/vieux%2Fsshfs:latest")).res.status).toBe(409);
    expect((await call("POST", "/plugins/vieux%2Fsshfs:latest/disable")).res.status).toBe(204);
    expect((await call("DELETE", "/plugins/vieux%2Fsshfs:latest")).res.status).toBe(204);
    expect((await call("GET", "/plugins")).json).toEqual([]);
  });

  it("changes passwords: own (needs the current one) and by an admin, signing sessions out", async () => {
    const login = async (username: string, password: string) => {
      const res = await fetch(`${base}/api/v1/auth/login`, {
        method: "POST",
        headers: { "x-nautix-csrf": "1", "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      return {
        status: res.status,
        cookie: (res.headers.get("set-cookie") ?? "").split(";")[0] ?? "",
      };
    };
    const get = (cookieHeader: string) =>
      fetch(`${base}/api/v1/containers`, { headers: { cookie: cookieHeader } }).then(
        (r) => r.status,
      );

    const second = await login("admin", "correct-horse-1");
    expect(await get(second.cookie)).toBe(200);

    expect(
      (
        await call("POST", "/auth/password", {
          currentPassword: "nope-nope-nope",
          newPassword: "another-pass-9",
        })
      ).res.status,
    ).toBe(401);
    expect(
      (
        await call("POST", "/auth/password", {
          currentPassword: "correct-horse-1",
          newPassword: "correct-horse-1",
        })
      ).res.status,
    ).toBe(422);
    expect(
      (
        await call("POST", "/auth/password", {
          currentPassword: "correct-horse-1",
          newPassword: "short",
        })
      ).res.status,
    ).toBe(422);
    expect(
      (
        await call("POST", "/auth/password", {
          currentPassword: "correct-horse-1",
          newPassword: "another-pass-9",
        })
      ).res.status,
    ).toBe(204);

    expect(await get(cookie)).toBe(200); // this session stays
    expect(await get(second.cookie)).toBe(401); // the other one is gone
    expect((await login("admin", "correct-horse-1")).status).toBe(401);
    expect((await login("admin", "another-pass-9")).status).toBe(204);
    expect(
      (
        await call("POST", "/auth/password", {
          currentPassword: "another-pass-9",
          newPassword: "correct-horse-1",
        })
      ).res.status,
    ).toBe(204);

    const created = await call("POST", "/settings/users", {
      username: "ana",
      password: "viewer-pass-1",
      role: "viewer",
    });
    const id = (created.json as { id: string }).id;
    const anaSession = await login("ana", "viewer-pass-1");
    expect(await get(anaSession.cookie)).toBe(200);
    expect(
      (
        await fetch(`${base}/api/v1/auth/password`, {
          method: "POST",
          headers: {
            cookie: anaSession.cookie,
            "x-nautix-csrf": "1",
            "content-type": "application/json",
          },
          body: JSON.stringify({ currentPassword: "viewer-pass-1", newPassword: "viewer-pass-2" }),
        })
      ).status,
    ).toBe(204);
    expect((await login("ana", "viewer-pass-2")).status).toBe(204);

    expect(
      (await call("PUT", `/settings/users/${id}/password`, { password: "reset-by-admin-1" })).res
        .status,
    ).toBe(204);
    expect(await get(anaSession.cookie)).toBe(401);
    expect((await login("ana", "viewer-pass-2")).status).toBe(401);
    expect((await login("ana", "reset-by-admin-1")).status).toBe(204);
    expect(
      (await call("PUT", `/settings/users/${id}/password`, { password: "short" })).res.status,
    ).toBe(422);
    expect(
      (await call("PUT", "/settings/users/missing/password", { password: "reset-by-admin-1" })).res
        .status,
    ).toBe(404);
    await call("DELETE", `/settings/users/${id}`);
  });

  it("edits custom DNS records of a dnsmasq container", async () => {
    await call("POST", "/containers", {
      name: "dns1",
      image: "dockurr/dnsmasq:2.93",
      networkId: null,
    });
    await call("POST", "/containers", {
      name: "other-dns",
      image: "adguard/adguardhome",
      networkId: null,
    });
    const servers = (
      (await call("GET", "/dns")).json as { name: string; kind: string | null }[]
    ).filter((s) => ["dns1", "other-dns"].includes(s.name));
    expect(servers.map((s) => [s.name, s.kind])).toEqual([
      ["dns1", "dnsmasq"],
      ["other-dns", null],
    ]);

    expect((await call("GET", "/dns/dns1/records")).json).toEqual([]);
    expect(
      (
        await call("PUT", "/dns/dns1/records", {
          records: [
            { name: "Web.Lab", ip: "10.0.0.5" },
            { name: "db.lab", ip: "fd00::5" },
          ],
        })
      ).res.status,
    ).toBe(204);
    expect((await call("GET", "/dns/dns1/records")).json).toEqual([
      { name: "web.lab", ip: "10.0.0.5" },
      { name: "db.lab", ip: "fd00::5" },
    ]);
    expect(
      (await call("PUT", "/dns/dns1/records", { records: [{ name: "bad name", ip: "10.0.0.5" }] }))
        .res.status,
    ).toBe(422);
    expect(
      (
        await call("PUT", "/dns/dns1/records", {
          records: [
            { name: "a.lab", ip: "1.1.1.1" },
            { name: "a.lab", ip: "2.2.2.2" },
          ],
        })
      ).res.status,
    ).toBe(422);

    const applied = await call("POST", "/dns/dns1/apply");
    expect(applied.json.ok).toBe(true);
    expect((await call("POST", "/dns/other-dns/apply")).res.status).toBe(422);
    expect((await call("POST", "/dns/missing/apply")).res.status).toBe(404);
    const lookup = await call("GET", "/dns/dns1/lookup?host=web.lab");
    expect(lookup.json.ok).toBe(true);
    expect((await call("GET", "/dns/dns1/lookup?host=bad%20host")).res.status).toBe(422);
  });

  it("edits records of a CoreDNS container, starting it on the first apply", async () => {
    await call("POST", "/containers", {
      name: "core1",
      image: "coredns/coredns:1.14.7",
      networkId: null,
    });
    const servers = (
      (await call("GET", "/dns")).json as { name: string; kind: string | null }[]
    ).filter((x) => x.name === "core1");
    expect(servers).toEqual([expect.objectContaining({ name: "core1", kind: "coredns" })]);
    await call("PUT", "/dns/core1/records", { records: [{ name: "svc.lab", ip: "10.1.1.1" }] });
    const core = ((await call("GET", "/containers")).json as { id: string; name: string }[]).find(
      (c) => c.name === "core1",
    );
    expect((await call("POST", `/containers/${core?.id}/stop`)).res.status).toBe(204);
    // CoreDNS cannot boot without its Corefile: applying writes it into the stopped container and starts it
    const first = await call("POST", "/dns/core1/apply");
    expect(first.json.ok).toBe(true);
    expect(
      ((await call("GET", "/containers")).json as { name: string; state: string }[]).find(
        (c) => c.name === "core1",
      )?.state,
    ).toBe("running");
    expect((await call("GET", "/dns/core1/lookup?host=svc.lab")).json.ok).toBe(true);
  });

  it("lists the IP of running containers on each network", async () => {
    const list = (await call("GET", "/containers")).json as {
      name: string;
      state: string;
      networks: string[];
      ips: Record<string, string>;
    }[];
    const traefik = list.find((c) => c.name === "traefik");
    expect(Object.keys(traefik?.ips ?? {}).sort()).toEqual([...(traefik?.networks ?? [])].sort());
    for (const ip of Object.values(traefik?.ips ?? {})) expect(ip).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
    for (const c of list.filter((x) => x.state !== "running")) expect(c.ips).toEqual({});
  });

  it("gives a container a fixed IP at creation or later, and checks it", async () => {
    const nets = (await call("GET", "/networks")).json as { id: string; name: string }[];
    const edge = nets.find((n) => n.name === "edge");
    const ipsOf = async (name: string) =>
      (
        (await call("GET", "/containers")).json as { name: string; ips: Record<string, string> }[]
      ).find((c) => c.name === name)?.ips;
    const make = (name: string, ipAddress?: string, networkId: string | null = edge?.id ?? null) =>
      call("POST", "/containers", {
        name,
        image: "nginx:1.27-alpine",
        networkId,
        ...(ipAddress ? { ipAddress } : {}),
      });

    expect((await make("fixed1", "172.30.0.50")).res.status).toBe(201);
    expect(await ipsOf("fixed1")).toEqual({ edge: "172.30.0.50" });
    expect((await make("fixed2", "172.30.0.50")).res.status).toBe(409);
    expect((await make("fixed3", "172.31.0.9")).res.status).toBe(422);
    expect((await make("fixed4", "172.30.0.1")).res.status).toBe(422);
    expect((await make("fixed5", "999.1.1.1")).res.status).toBe(422);
    expect((await make("fixed6", "172.30.0.60", null)).res.status).toBe(422);

    await make("later");
    expect(
      (await call("PUT", "/containers/later/fixed-ip", { network: "edge", ip: "172.30.0.77" })).res
        .status,
    ).toBe(204);
    expect(await ipsOf("later")).toEqual({ edge: "172.30.0.77" });
    expect(
      (await call("PUT", "/containers/later/fixed-ip", { network: "edge", ip: "172.30.0.50" })).res
        .status,
    ).toBe(409);
    expect(
      (await call("PUT", "/containers/later/fixed-ip", { network: "backend", ip: "172.31.0.9" }))
        .res.status,
    ).toBe(409);
    expect(
      (await call("PUT", "/containers/later/fixed-ip", { network: "nope", ip: "172.30.0.9" })).res
        .status,
    ).toBe(404);
    expect(
      (await call("PUT", "/containers/later/fixed-ip", { network: "edge", ip: null })).res.status,
    ).toBe(204);
    expect((await ipsOf("later"))?.edge).not.toBe("172.30.0.77");
    expect(
      (await call("PUT", "/containers/nautix/fixed-ip", { network: "bridge", ip: "172.17.0.9" }))
        .res.status,
    ).toBe(403);
  });

  it("reports info, version and disk usage", async () => {
    expect(
      ((await call("GET", "/system/info")).json as { ServerVersion: string }).ServerVersion,
    ).toBe("demo");
    expect(((await call("GET", "/system/version")).json as { ApiVersion: string }).ApiVersion).toBe(
      "1.43",
    );
    const df = (await call("GET", "/system/df")).json as { images: { count: number } };
    expect(df.images.count).toBeGreaterThan(0);
  });

  it("previews a prune without changing anything, then prunes after the preview", async () => {
    await call("POST", "/containers", { name: "to-prune", image: "nginx", networkId: null });
    const list = (await call("GET", "/containers")).json as { id: string; name: string }[];
    const id = list.find((c) => c.name === "to-prune")?.id;
    await call("POST", `/containers/${id}/stop`);

    const preview = (await call("GET", "/system/prune/preview?kind=containers")).json as {
      items: { name: string }[];
    };
    expect(preview.items.map((i) => i.name)).toContain("to-prune");
    expect(preview.items.map((i) => i.name)).not.toContain("nautix");
    const stillThere = (await call("GET", "/containers")).json as { name: string }[];
    expect(stillThere.map((c) => c.name)).toContain("to-prune");

    const result = (await call("POST", "/system/prune", { kind: "containers" })).json as {
      deleted: number;
    };
    expect(result.deleted).toBeGreaterThanOrEqual(1);
    const gone = (await call("GET", "/containers")).json as { name: string }[];
    expect(gone.map((c) => c.name)).not.toContain("to-prune");
    expect(gone.map((c) => c.name)).toContain("nautix");
    expect((await call("GET", "/system/prune/preview?kind=bogus")).res.status).toBe(422);
  });
});

describe("gateway (Kong) routes", () => {
  const route = {
    name: "hola",
    path: "/hola",
    upstream: "http://tunnel-extranet-to-intranet-80:80",
    stripPath: true,
  };

  it("detects Kong, stores the mappings and applies them with a throw-away helper", async () => {
    const gateways = (await call("GET", "/gateways")).json as { name: string }[];
    expect(gateways.map((g) => g.name)).toContain("kong");

    expect((await call("PUT", "/gateways/kong/routes", { routes: [route] })).res.status).toBe(204);
    expect((await call("GET", "/gateways/kong/routes")).json).toEqual([route]);

    const applied = await call("POST", "/gateways/kong/apply");
    expect(applied.res.status).toBe(200);
    expect(applied.json).toMatchObject({ ok: true });

    const leftovers = ((await call("GET", "/containers")).json as { name: string }[]).filter((c) =>
      c.name.startsWith("nautix-apply-"),
    );
    expect(leftovers).toEqual([]);
  });

  it("rejects bad routes and things that are not gateways", async () => {
    expect(
      (await call("PUT", "/gateways/kong/routes", { routes: [{ ...route, upstream: "ftp://x" }] }))
        .res.status,
    ).toBe(422);
    expect(
      (await call("PUT", "/gateways/kong/routes", { routes: [route, route] })).res.status,
    ).toBe(422);
    expect(
      (
        await call("PUT", "/gateways/kong/routes", {
          routes: [{ name: "x", upstream: "http://a:1" }],
        })
      ).res.status,
    ).toBe(422);
    await call("PUT", "/gateways/postgres/routes", { routes: [] });
    const notKong = await call("POST", "/gateways/postgres/apply");
    expect(notKong.res.status).toBe(422);
    expect(notKong.json.hintKey).toBe("errors.notGateway");
  });
});

describe("gateways and proxies of every supported type", () => {
  const route = {
    name: "hola",
    path: "/hola",
    upstream: "http://tunnel-extranet-to-intranet-80",
    stripPath: true,
  };

  it("lists Kong and the proxies with their kind", async () => {
    await call("POST", "/containers", {
      name: "edge-caddy",
      image: "caddy:2-alpine",
      networkId: null,
    });
    const list = (await call("GET", "/gateways")).json as { name: string; kind: string }[];
    const kinds = Object.fromEntries(list.map((g) => [g.name, g.kind]));
    expect(kinds).toMatchObject({
      kong: "kong",
      traefik: "traefik",
      standalone: "nginx",
      "edge-caddy": "caddy",
    });
    expect(list.find((g) => g.name === "postgres")).toBeUndefined();
  });

  it("applies the same mappings to Traefik, Nginx and Caddy", async () => {
    for (const name of ["traefik", "standalone", "edge-caddy"]) {
      expect((await call("PUT", `/gateways/${name}/routes`, { routes: [route] })).res.status).toBe(
        204,
      );
      const applied = await call("POST", `/gateways/${name}/apply`);
      expect(applied.res.status, name).toBe(200);
      expect(applied.json, name).toMatchObject({ ok: true });
    }
  });

  it("refuses what a proxy cannot express, and duplicates, with a hint", async () => {
    await call("PUT", "/gateways/traefik/routes", {
      routes: [{ ...route, upstream: "http://a:80/base" }],
    });
    const withPath = await call("POST", "/gateways/traefik/apply");
    expect(withPath.res.status).toBe(422);
    expect(withPath.json.hintKey).toBe("errors.gatewayUpstreamPath");
    // Kong can proxy to a path
    await call("PUT", "/gateways/kong/routes", {
      routes: [{ ...route, upstream: "http://a:80/base" }],
    });
    expect((await call("POST", "/gateways/kong/apply")).res.status).toBe(200);

    await call("PUT", "/gateways/standalone/routes", {
      routes: [route, { ...route, name: "otra" }],
    });
    const dup = await call("POST", "/gateways/standalone/apply");
    expect(dup.res.status).toBe(422);
    expect(dup.json.hintKey).toBe("errors.gatewayDuplicateRoute");
  });
});
