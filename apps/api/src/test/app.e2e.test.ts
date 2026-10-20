import "reflect-metadata";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
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
  dataDir = mkdtempSync(join(tmpdir(), "nautix-"));
  const config: AppConfig = {
    host: "127.0.0.1",
    port: 0,
    dataDir,
    engine: "fake",
    dockerSocket: "",
    webDist: "",
    secureCookies: false,
  };
  const logs: string[] = [];
  vi.spyOn(console, "log").mockImplementation((m: string) => logs.push(String(m)));
  app = await NestFactory.create(AppModule.register(config), { logger: false });
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
    expect(ids).toEqual(expect.arrayContaining(["mssql", "kafka", "n8n"]));
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
