import { buildTar } from "../modules/docker/domain/tar.js";
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

  it("ships SQL Server, Kafka, n8n and the cloud emulators", async () => {
    const ids = (await list()).map((t) => t.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "mssql",
        "kafka",
        "n8n",
        "adguardhome",
        "pihole",
        "dnsmasq",
        "floci-aws",
        "floci-azure",
        "floci-gcp",
        "floci-oci",
      ]),
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
      detail: string;
      status: number;
    }[];
    expect(rows[0]).toMatchObject({
      actor: "admin",
      action: "PUT /api/v1/registries",
      status: 200,
    });
    expect(rows.some((r) => r.action.startsWith("POST /api/v1/auth/login"))).toBe(true);
    expect(JSON.stringify(rows)).not.toContain("p4ssw0rd-x");
    // Reads are not recorded, except the few flagged as sensitive (they say so in their detail).
    expect(
      rows.filter((r) => r.action.startsWith("GET")).every((r) => r.detail.startsWith("read ")),
    ).toBe(true);
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

  it("stores allow lists on gateway routes and rejects bad entries", async () => {
    await call("POST", "/containers", {
      name: "gw-allow",
      image: "nginx:1.27-alpine",
      networkId: null,
    });
    const put = (allow: unknown) =>
      call("PUT", "/gateways/gw-allow/routes", {
        routes: [{ name: "api", path: "/api", upstream: "http://svc:8080", allow }],
      });
    expect((await put(["10.0.0.0/24", "192.168.1.5", "fd00::/8"])).res.status).toBe(204);
    expect(
      ((await call("GET", "/gateways/gw-allow/routes")).json as { allow: string[] }[])[0]?.allow,
    ).toEqual(["10.0.0.0/24", "192.168.1.5", "fd00::/8"]);
    expect((await put(["10.0.0.0/33"])).res.status).toBe(422);
    expect((await put(["not-an-ip"])).res.status).toBe(422);
    // routes saved before allow lists existed still load, with an empty list
    expect((await put(undefined)).res.status).toBe(204);
    expect(
      ((await call("GET", "/gateways/gw-allow/routes")).json as { allow: string[] }[])[0]?.allow,
    ).toEqual([]);
    expect(
      typeof ((await call("GET", "/gateways/client-address")).json as { address: string }).address,
    ).toBe("string");
  });

  it("guards ports from the host firewall: rules, helper token, trial, confirmation and lock-out checks", async () => {
    await call("POST", "/containers", {
      name: "guard-db",
      image: "postgres:16-alpine",
      networkId: null,
      ports: [{ containerPort: 5432, hostPort: 15432 }],
    });
    const rule = (over: Record<string, unknown> = {}) => ({
      container: "guard-db",
      port: 5432,
      protocol: "tcp",
      allow: ["10.0.0.0/24"],
      ...over,
    });
    const save = (rules: unknown[], acknowledgeLockout = false) =>
      call("PUT", "/guard/rules", { rules, acknowledgeLockout });
    type Status = {
      helper: { connected: boolean; backend: string | null; ok: boolean | null };
      tokenSet: boolean;
      rules: unknown[];
      trial: { deadline: string; rules: unknown[] } | null;
      unresolved: unknown[];
    };
    const status = async () => (await call("GET", "/guard")).json as Status;

    expect(await status()).toMatchObject({ tokenSet: false, rules: [], trial: null });

    // validation and lock-out protection
    expect((await save([rule({ allow: ["10.0.0.0/33"] })])).res.status).toBe(422);
    expect((await save([rule({ port: 9999 })])).res.status).toBe(422);
    expect((await save([rule({ container: "nope" })])).res.status).toBe(404);
    expect((await save([rule(), rule()])).res.status).toBe(422);
    const lockout = await save([rule()]);
    expect(lockout.res.status).toBe(409);
    expect(lockout.json.hintKey).toBe("errors.guardLockout");
    const self = await save([
      rule({ container: "nautix", port: 3737, allow: ["127.0.0.1", "::1"] }),
    ]);
    expect(self.res.status).toBe(409);
    expect(self.json.hintKey).toBe("errors.guardLockoutSelf");

    // without a helper the rules are simply stored
    const stored = await save([rule()], true);
    expect(stored.res.status).toBe(200);
    expect(stored.json.trialUntil).toBeNull();
    expect((await status()).rules).toHaveLength(1);

    // the helper's routes need its own token
    const planUrl = `${base}/api/v1/guard/helper/plan`;
    expect((await fetch(planUrl)).status).toBe(401);
    expect((await fetch(planUrl, { headers: { authorization: "Bearer ngd_wrong" } })).status).toBe(
      401,
    );
    const { token } = (await call("POST", "/guard/token")).json as { token: string };
    expect(token).toMatch(/^ngd_/);
    expect((await status()).tokenSet).toBe(true);
    const helper = { authorization: `Bearer ${token}` };
    const plan = await (await fetch(planUrl, { headers: helper })).json();
    expect(plan).toMatchObject({
      rules: [{ hostPort: 15432, protocol: "tcp", allow: ["10.0.0.0/24"] }],
      fallback: null,
      validUntil: null,
    });
    expect((await status()).helper.connected).toBe(true);
    const reported = await fetch(`${base}/api/v1/guard/helper/report`, {
      method: "POST",
      headers: { ...helper, "content-type": "application/json" },
      body: JSON.stringify({ revision: plan.revision, backend: "iptables", ok: true }),
    });
    expect(reported.status).toBe(204);
    expect((await status()).helper).toMatchObject({ backend: "iptables", ok: true });

    // a new token replaces the old one
    const { token: second } = (await call("POST", "/guard/token")).json as { token: string };
    expect((await fetch(planUrl, { headers: helper })).status).toBe(401);
    expect((await fetch(planUrl, { headers: { authorization: `Bearer ${second}` } })).status).toBe(
      200,
    );

    // with a helper connected a change goes on trial, with the old rules as fallback
    const trial = await save([rule({ allow: ["192.168.0.0/16"] })], true);
    expect(trial.json.trialUntil).toEqual(expect.any(String));
    const during = await (
      await fetch(planUrl, { headers: { authorization: `Bearer ${second}` } })
    ).json();
    expect(during.rules[0].allow).toEqual(["192.168.0.0/16"]);
    expect(during.fallback[0].allow).toEqual(["10.0.0.0/24"]);
    expect(during.validUntil).toBe(trial.json.trialUntil);
    expect((await status()).trial?.rules).toHaveLength(1);

    expect((await call("POST", "/guard/confirm")).res.status).toBe(204);
    expect((await call("POST", "/guard/confirm")).res.status).toBe(409);
    const after = await status();
    expect(after.trial).toBeNull();
    expect((after.rules[0] as { allow: string[] }).allow).toEqual(["192.168.0.0/16"]);

    // the preview shows the exact commands, for either backend
    const ipt = (await call("GET", "/guard/preview?backend=iptables")).json;
    expect(
      ipt.apply.some((s: { stdin?: string }) => s.stdin?.includes("--ctorigdstport 15432")),
    ).toBe(true);
    const nft = (await call("GET", "/guard/preview?backend=nftables")).json;
    expect(nft.apply[0].file.content).toContain("ct original proto-dst 15432");
    expect((await call("GET", "/guard/preview?backend=pf")).res.status).toBe(422);

    expect((await call("DELETE", "/guard/rules")).res.status).toBe(204);
    expect(await status()).toMatchObject({ rules: [], trial: null });
  });

  it("edits a container's environment safely: applied, never echoed, and rolled back when the new one fails", async () => {
    await call("POST", "/containers", {
      name: "env-app",
      image: "nginx:1.27-alpine",
      networkId: null,
      env: { KEEP: "yes", OLD: "1" },
    });
    const env = (body: unknown) => call("PUT", "/containers/env-app/env", body);
    const stored = async () => {
      const id = ((await call("GET", "/containers")).json as { id: string; name: string }[]).find(
        (c) => c.name === "env-app",
      )?.id;
      const raw = (await call("GET", `/containers/${id}/inspect`)).json as {
        Config: { Env: string[] };
      };
      return Object.fromEntries(raw.Config.Env.map((e) => [e.split("=")[0], e.split("=")[1]]));
    };

    const ok = await env({ set: { API_URL: "http://x", OLD: "2" }, unset: ["KEEP"] });
    expect(ok.res.status).toBe(200);
    expect(ok.json).toEqual({ changed: ["API_URL", "KEEP", "OLD"] });
    expect(JSON.stringify(ok.json)).not.toContain("http://x");
    expect(await stored()).toEqual({ API_URL: "http://x", OLD: "2" });

    // a failing new container is rolled back: the environment is exactly as before
    const failed = await env({ set: { NAUTIX_FAKE_FAIL: "1", ONLY_IF_OK: "1" } });
    expect(failed.res.status).toBe(409);
    expect(failed.json.hintKey).toBe("errors.applyUnhealthy");
    expect(await stored()).toEqual({ API_URL: "http://x", OLD: "2" });

    expect((await env({})).res.status).toBe(422);
    expect((await env({ set: { "bad name": "1" } })).res.status).toBe(422);
    expect((await env({ set: { A: "1" }, unset: ["A"] })).res.status).toBe(422);
    expect((await env({ set: { A: "1" }, gate: { settleSeconds: 99 } })).res.status).toBe(422);
    expect((await call("PUT", "/containers/missing-one/env", { set: { A: "1" } })).res.status).toBe(
      404,
    );
    const self = (
      (await call("GET", "/containers")).json as { id: string; isSelf?: boolean }[]
    ).find((c) => c.isSelf);
    expect((await call("PUT", `/containers/${self?.id}/env`, { set: { A: "1" } })).res.status).toBe(
      403,
    );
  });

  it("binds an app to a service: network, connection settings, safe apply, re-apply and removal", async () => {
    const net = await call("POST", "/networks", { name: "bind-net", internal: false });
    expect(net.res.status).toBe(201);
    await call("POST", "/containers", {
      name: "bind-db",
      image: "postgres:16-alpine",
      networkId: net.json.id,
      env: { POSTGRES_USER: "app", POSTGRES_PASSWORD: "hunter2", POSTGRES_DB: "orders" },
    });
    await call("POST", "/containers", {
      name: "bind-api",
      image: "myorg/api:1",
      networkId: null,
      env: { KEEP: "yes" },
    });
    const envOf = async (name: string) => {
      const id = ((await call("GET", "/containers")).json as { id: string; name: string }[]).find(
        (c) => c.name === name,
      )?.id;
      const raw = (await call("GET", `/containers/${id}/inspect`)).json as {
        Config: { Env: string[] };
        NetworkSettings: { Networks: Record<string, unknown> };
      };
      return {
        env: Object.fromEntries(
          raw.Config.Env.map((e) => [e.slice(0, e.indexOf("=")), e.slice(e.indexOf("=") + 1)]),
        ),
        networks: Object.keys(raw.NetworkSettings.Networks),
      };
    };
    const body = { consumer: "bind-api", provider: "bind-db", name: "Orders" };

    // the plan changes nothing and never shows the password
    const plan = await call("POST", "/bindings/plan", body);
    expect(plan.res.status).toBe(200);
    expect(plan.json).toMatchObject({
      kind: "postgres",
      network: "bind-net",
      joins: true,
      recreates: true,
    });
    expect(plan.json.variables[0].key).toBe("ConnectionStrings__Orders");
    expect(JSON.stringify(plan.json)).not.toContain("hunter2");
    expect(plan.json.variables[0].preview).toContain("Host=bind-db;Port=5432;Database=orders");
    expect((await envOf("bind-api")).env.ConnectionStrings__Orders).toBeUndefined();

    // create: the consumer joins the network and receives the real settings
    const created = await call("POST", "/bindings", body);
    expect(created.res.status).toBe(201);
    expect(created.json).toMatchObject({
      consumer: "bind-api",
      provider: "bind-db",
      kind: "postgres",
      name: "Orders",
      variables: ["ConnectionStrings__Orders"],
    });
    expect(JSON.stringify(created.json)).not.toContain("hunter2");
    let api = await envOf("bind-api");
    expect(api.env.ConnectionStrings__Orders).toBe(
      "Host=bind-db;Port=5432;Database=orders;Username=app;Password=hunter2",
    );
    expect(api.env.KEEP).toBe("yes");
    expect(api.networks).toContain("bind-net");
    expect(((await call("GET", "/bindings")).json as unknown[]).length).toBe(1);

    // the same name twice, itself, an unknown container and Nautix itself are refused
    expect((await call("POST", "/bindings", body)).res.status).toBe(409);
    expect(
      (await call("POST", "/bindings", { consumer: "bind-api", provider: "bind-api" })).res.status,
    ).toBe(422);
    expect((await call("POST", "/bindings", { ...body, provider: "nope" })).res.status).toBe(404);
    expect(
      (await call("POST", "/bindings", { ...body, provider: "nautix", name: "Self" })).res.status,
    ).toBe(422);
    expect((await call("POST", "/bindings", { ...body, name: "bad name" })).res.status).toBe(422);

    // a provider that is only on the default network cannot be reached by name
    await call("POST", "/containers", { name: "bind-flat", image: "redis:7", networkId: null });
    const flat = await call("POST", "/bindings", { consumer: "bind-api", provider: "bind-flat" });
    expect(flat.res.status).toBe(422);
    expect(flat.json.hintKey).toBe("errors.bindingNeedsNetwork");

    // a binding whose apply fails is rolled back and never stored
    const failing = await call("POST", "/bindings", {
      consumer: "bind-api",
      provider: "bind-db",
      name: "NautixFakeFail",
      style: "url",
    });
    expect(failing.res.status).toBe(409);
    expect(failing.json.hintKey).toBe("errors.applyUnhealthy");
    expect(((await call("GET", "/bindings")).json as unknown[]).length).toBe(1);
    api = await envOf("bind-api");
    expect(Object.keys(api.env).some((k) => k.startsWith("NAUTIX_FAKE_FAIL"))).toBe(false);

    // the provider's password changes: re-applying brings the consumer up to date
    expect(
      (await call("PUT", "/containers/bind-db/env", { set: { POSTGRES_PASSWORD: "n3w" } })).res
        .status,
    ).toBe(200);
    expect((await envOf("bind-api")).env.ConnectionStrings__Orders).toContain("Password=hunter2");
    const again = await call("POST", `/bindings/${created.json.id}/apply`);
    expect(again.res.status).toBe(200);
    expect((await envOf("bind-api")).env.ConnectionStrings__Orders).toContain("Password=n3w");

    // removing the binding removes exactly its variables
    expect((await call("DELETE", `/bindings/${created.json.id}`)).res.status).toBe(204);
    api = await envOf("bind-api");
    expect(api.env.ConnectionStrings__Orders).toBeUndefined();
    expect(api.env.KEEP).toBe("yes");
    expect(((await call("GET", "/bindings")).json as unknown[]).length).toBe(0);
    expect((await call("DELETE", `/bindings/${created.json.id}`)).res.status).toBe(404);
  });

  it("manages a zone from one document: describe, plan, apply, drift and removals", async () => {
    const doc = (extra = "") => `
version: 1
zone:
  name: zshop
services:
  z-db:
    image: postgres:16-alpine
    env:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: ${extra ? "other" : "pw"}
      POSTGRES_DB: orders
  z-api:
    image: myorg/api:1
    env: { MODE: ${extra ? "staging" : "prod"} }
    ports:
      - { container: 8080, host: 18081 }
    bindings:
      - { to: z-db, name: Orders }
${extra}`;
    type Plan = {
      plan: {
        actions: { kind: string; service?: string; fields?: string[] }[];
        hash: string;
        errors: { key: string }[];
        warnings: { key: string }[];
      } | null;
      problems: { path: string; message: string }[];
    };
    const plan = async (text: string) =>
      (await call("POST", "/zones/zshop/plan", { spec: text })).json as Plan;
    const apply = (text: string, planHash: string, allowRemovals = false) =>
      call("POST", "/zones/zshop/apply", { spec: text, planHash, allowRemovals });
    const envOf = async (name: string) => {
      const id = ((await call("GET", "/containers")).json as { id: string; name: string }[]).find(
        (c) => c.name === name,
      )?.id;
      const raw = (await call("GET", `/containers/${id}/inspect`)).json as {
        Config: { Env: string[] };
      };
      return Object.fromEntries(
        raw.Config.Env.map((e) => [e.slice(0, e.indexOf("=")), e.slice(e.indexOf("=") + 1)]),
      );
    };

    // nothing exists yet
    const empty = (await call("GET", "/zones/zshop/spec")).json as {
      current: string;
      stored: string | null;
    };
    expect(empty.stored).toBeNull();
    expect(empty.current).toContain("name: zshop");

    // plan from scratch: network, both services, then the binding
    const first = await plan(doc());
    expect(first.problems).toEqual([]);
    expect(first.plan?.actions.map((a) => a.kind)).toEqual([
      "create-network",
      "create-service",
      "create-service",
      "add-binding",
    ]);
    // a stale or made-up hash is refused and nothing runs
    expect((await apply(doc(), "0000")).res.status).toBe(409);
    expect(
      ((await call("GET", "/networks")).json as { name: string }[]).some((n) => n.name === "zshop"),
    ).toBe(false);

    const run = await apply(doc(), first.plan?.hash ?? "");
    expect(run.res.status).toBe(200);
    expect(run.json.ok).toBe(true);
    expect(run.json.results.map((r: { status: string }) => r.status)).toEqual([
      "done",
      "done",
      "done",
      "done",
    ]);
    expect((await envOf("z-api")).ConnectionStrings__Orders).toContain("Password=pw");
    expect(
      ((await call("GET", "/bindings")).json as { consumer: string }[]).some(
        (b) => b.consumer === "z-api",
      ),
    ).toBe(true);

    // it is now exactly what the document says
    expect((await plan(doc())).plan?.actions).toEqual([]);
    const listed = (
      (await call("GET", "/zones")).json as { name: string; hasSpec: boolean; drift: number }[]
    ).find((z) => z.name === "zshop");
    expect(listed).toMatchObject({ hasSpec: true, drift: 0 });
    // describing reality gives back an equivalent document
    const described = (await call("GET", "/zones/zshop/spec")).json as {
      current: string;
      stored: string;
    };
    expect((await plan(described.current)).plan?.actions).toEqual([]);

    // a change to the service another one reads from also refreshes the reader
    const changed = await plan(doc("# edited"));
    expect(changed.plan?.actions.map((a) => `${a.kind}:${a.service ?? ""}`)).toEqual([
      "update-service:z-db",
      "update-service:z-api",
      "reapply-binding:",
    ]);
    expect((await apply(doc("# edited"), changed.plan?.hash ?? "")).json.ok).toBe(true);
    expect((await envOf("z-api")).MODE).toBe("staging");
    expect((await envOf("z-api")).ConnectionStrings__Orders).toContain("Password=other");
    expect((await plan(doc("# edited"))).plan?.actions).toEqual([]);

    // someone changes reality by hand: the zone reports drift and the plan shows how to undo it
    expect(
      (await call("PUT", "/containers/z-api/env", { set: { MODE: "by-hand" } })).res.status,
    ).toBe(200);
    const drifted = ((await call("GET", "/zones")).json as { name: string; drift: number }[]).find(
      (z) => z.name === "zshop",
    );
    expect(drifted?.drift).toBe(1);
    expect((await plan(doc("# edited"))).plan?.actions).toEqual([
      { kind: "update-service", service: "z-api", fields: ["env"] },
    ]);

    // a failing action stops the run, leaves the rest alone and does not become the desired spec
    const poisoned = doc("# edited").replace(
      "MODE: staging",
      "MODE: staging, NAUTIX_FAKE_FAIL_X: '1'",
    );
    const bad = await plan(poisoned);
    const failed = await apply(poisoned, bad.plan?.hash ?? "");
    expect(failed.json.ok).toBe(false);
    expect(failed.json.results[0].status).toBe("failed");
    expect(failed.json.results[0].detail).toContain("not accepted");
    expect(
      ((await call("GET", "/zones/zshop/spec")).json as { stored: string }).stored,
    ).not.toContain("NAUTIX_FAKE_FAIL_X");

    // removals need to be allowed explicitly
    const slim = `
version: 1
zone:
  name: zshop
services:
  z-db:
    image: postgres:16-alpine
    env:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: other
      POSTGRES_DB: orders
`;
    const removing = await plan(slim);
    expect(removing.plan?.actions.map((a) => a.kind)).toEqual(["remove-service"]);
    expect(removing.plan?.warnings.map((w) => w.key)).toContain("removesService");
    const kept = await apply(slim, removing.plan?.hash ?? "");
    expect(kept.json.results.map((r: { status: string }) => r.status)).toEqual(["skipped"]);
    expect(
      ((await call("GET", "/containers")).json as { name: string }[]).some(
        (c) => c.name === "z-api",
      ),
    ).toBe(true);
    const again = await plan(slim);
    expect(again.plan?.actions.map((a) => a.kind)).toEqual(["remove-service"]);
    expect((await apply(slim, again.plan?.hash ?? "", true)).json.ok).toBe(true);
    // removing the app also removed its binding record
    expect(
      ((await call("GET", "/bindings")).json as { consumer: string }[]).some(
        (b) => b.consumer === "z-api",
      ),
    ).toBe(false);
    expect(
      ((await call("GET", "/containers")).json as { name: string }[]).some(
        (c) => c.name === "z-api",
      ),
    ).toBe(false);
    expect((await plan(slim)).plan?.actions).toEqual([]);

    // invalid documents, another zone's document and names that belong to other containers
    const broken = await plan(
      "version: 1\nzone: { name: zshop }\nservices:\n  a: { image: x, typo: 1 }",
    );
    expect(broken.plan).toBeNull();
    expect(broken.problems[0]?.path).toBe("services.a");
    expect((await apply("a: [", "x")).res.status).toBe(422);
    expect((await plan(slim.replace("name: zshop", "name: other"))).problems[0]?.path).toBe(
      "zone.name",
    );
    expect((await apply(slim.replace("name: zshop", "name: other"), "x")).res.status).toBe(422);
    await call("POST", "/containers", { name: "z-taken", image: "nginx", networkId: null });
    const clash = await plan(slim.replace("z-db:", "z-taken:"));
    expect(clash.plan?.errors.map((e) => e.key)).toEqual(["nameTakenOutside"]);
    expect(
      (await apply(slim.replace("z-db:", "z-taken:"), clash.plan?.hash ?? "")).res.status,
    ).toBe(422);
  });

  it("shows who can reach each published port and changes it", async () => {
    await call("POST", "/containers", {
      name: "exp-web",
      image: "nginx:1.27-alpine",
      networkId: null,
      ports: [{ containerPort: 80, hostPort: 18080 }],
    });
    await call("POST", "/containers", {
      name: "exp-lan",
      image: "nginx:1.27-alpine",
      networkId: null,
      ports: [{ containerPort: 80, hostPort: 18081, bindAddress: "192.168.1.20" }],
    });
    const rows = () =>
      (
        call("GET", "/exposure") as Promise<{
          json: { container: string; hostIp: string; exposure: { kind: string } }[];
        }>
      ).then((r) => r.json.filter((x) => x.container.startsWith("exp-")));
    expect((await rows()).map((r) => [r.container, r.exposure.kind])).toEqual([
      ["exp-lan", "address"],
      ["exp-web", "local"],
    ]);

    const change = (exposure: unknown, port = 80) =>
      call("PUT", "/containers/exp-web/exposure", { ports: [{ containerPort: port, exposure }] });
    expect((await change({ kind: "open" })).res.status).toBe(204);
    expect((await rows())[0]).toMatchObject({ container: "exp-web", exposure: { kind: "open" } });
    expect((await change({ kind: "address", address: "10.0.0.2" })).res.status).toBe(204);
    expect((await rows()).find((r) => r.container === "exp-web")?.hostIp).toBe("10.0.0.2");
    expect((await change({ kind: "local" })).res.status).toBe(204);
    expect((await change({ kind: "local" }, 9999)).res.status).toBe(422);
    expect((await change({ kind: "address", address: "nope" })).res.status).toBe(422);
    expect(
      (
        await call("PUT", "/containers/missing-one/exposure", {
          ports: [{ containerPort: 80, exposure: { kind: "open" } }],
        })
      ).res.status,
    ).toBe(404);
  });

  it("builds from an uploaded project folder (tar body) and limits the options", async () => {
    const tar = buildTar([
      { path: "Dockerfile", content: 'FROM alpine:3.20\nCOPY app.txt /app.txt\nCMD ["sh"]\n' },
      { path: "app.txt", content: "hello" },
    ]);
    const post = (options: unknown, body: Buffer) =>
      fetch(
        `${base}/api/v1/builds/context?options=${encodeURIComponent(JSON.stringify(options))}`,
        {
          method: "POST",
          headers: { cookie, "x-nautix-csrf": "1", "content-type": "application/x-tar" },
          body: new Uint8Array(body),
        },
      );
    const ok = await post({ tag: "demo/folder:1" }, tar);
    expect(ok.status).toBe(200);
    expect((await ok.text()).trim().endsWith("NAUTIX-BUILD: ok")).toBe(true);
    const images = (await call("GET", "/images")).json as { tags: string[] }[];
    expect(images.some((i) => i.tags.includes("demo/folder:1"))).toBe(true);
    expect((await post({ tag: "bad tag!" }, tar)).status).toBe(422);
    expect((await post({ tag: "demo/x:1", dockerfilePath: "../Dockerfile" }, tar)).status).toBe(
      422,
    );
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
    // A drained node takes no new copies: put it back before creating services.
    await call("PATCH", `/swarm/nodes/${nodes[0]?.id}`, { availability: "active" });

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

  it("downloads a volume path as a tar and uploads one into it, through helpers that are removed", async () => {
    await call("POST", "/volumes", { name: "xfer" });
    const down = await fetch(`${base}/api/v1/volumes/xfer/archive?path=/hello.txt`, {
      headers: { cookie },
    });
    expect(down.status).toBe(200);
    expect(down.headers.get("content-type")).toBe("application/x-tar");
    expect(down.headers.get("content-disposition")).toBe(
      'attachment; filename="xfer-hello.txt.tar"',
    );
    expect(await down.text()).toContain("FAKE-TAR");

    const up = (path: string) =>
      fetch(`${base}/api/v1/volumes/xfer/archive?path=${encodeURIComponent(path)}`, {
        method: "PUT",
        headers: { cookie, "x-nautix-csrf": "1", "content-type": "application/x-tar" },
        body: new Uint8Array(Buffer.from("tar-bytes")),
      });
    expect((await up("/data")).status).toBe(204);
    expect((await up("/a/../b")).status).toBe(422);
    expect((await up("relative")).status).toBe(422);
    const missing = await fetch(`${base}/api/v1/volumes/nope/archive?path=/`, {
      headers: { cookie },
    });
    expect(missing.status).toBe(404);

    const left = (
      (await call("GET", "/containers")).json as { labels: Record<string, string> }[]
    ).filter((c) => c.labels["nautix.helper"]);
    expect(left).toHaveLength(0);
    const details = (
      (await call("GET", "/settings/audit?limit=100&q=xfer")).json as {
        detail: string;
      }[]
    ).map((r) => r.detail);
    expect(details).toContain("volume download volume=xfer path=/hello.txt");
    expect(details).toContain("volume upload volume=xfer into=/data");
    await call("DELETE", "/volumes/xfer");
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

  it("points a DNS record at a container by name and resolves it when applying", async () => {
    await call("POST", "/containers", {
      name: "dns-by-name",
      image: "dockurr/dnsmasq:2.93",
      networkId: null,
    });
    await call("POST", "/containers", {
      name: "dns-target",
      image: "nginx:1.27-alpine",
      networkId: null,
    });
    const save = (records: unknown) => call("PUT", "/dns/dns-by-name/records", { records });
    expect(
      (
        await save([
          { name: "app.test", container: "dns-target" },
          { name: "db.test", ip: "10.0.0.9" },
        ])
      ).res.status,
    ).toBe(204);
    expect((await call("GET", "/dns/dns-by-name/records")).json).toEqual([
      { name: "app.test", container: "dns-target" },
      { name: "db.test", ip: "10.0.0.9" },
    ]);
    expect((await call("POST", "/dns/dns-by-name/apply")).json.ok).toBe(true);

    // a container name counts as the IPv4 record of the name
    expect(
      (
        await save([
          { name: "x.test", container: "dns-target" },
          { name: "x.test", ip: "1.1.1.1" },
        ])
      ).res.status,
    ).toBe(422);
    expect((await save([{ name: "x.test", container: "bad name!" }])).res.status).toBe(422);

    await save([{ name: "gone.test", container: "no-such-container" }]);
    const missing = await call("POST", "/dns/dns-by-name/apply");
    expect(missing.res.status).toBe(422);
    expect(JSON.stringify(missing.json)).toContain("dnsTargetMissing");
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
    expect((await call("GET", "/gateways/kong/routes")).json).toEqual([{ ...route, allow: [] }]);

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

  it("names what changed in the audit trail, never a value, and records who read the environment", async () => {
    type Row = { actor: string; action: string; detail: string; status: number };
    const trail = async (q = "") =>
      (await call("GET", `/settings/audit?limit=500${q}`)).json as Row[];
    const containers = (await call("GET", "/containers")).json as { id: string; name: string }[];
    const target = containers.find((c) => c.name === "standalone");
    expect(target).toBeDefined();
    const secret = "s3cr3t-value-that-must-not-be-logged";

    const env = await call("PUT", `/containers/${target?.id}/env`, {
      set: { AUDIT_API_KEY: secret },
      unset: ["AUDIT_OLD"],
    });
    expect(env.res.status).toBe(200);

    // Two reads by the same person inside the quiet period leave one entry.
    await call("GET", `/containers/${target?.id}/inspect`);
    await call("GET", `/containers/${target?.id}/inspect`);
    await call("GET", "/zones/zshop/spec");

    const rows = await trail();
    expect(rows.find((r) => r.detail.startsWith("env container=standalone"))).toMatchObject({
      actor: "admin",
      status: 200,
      detail: "env container=standalone set=AUDIT_API_KEY unset=AUDIT_OLD",
    });
    expect(rows.filter((r) => r.detail === "read env container=standalone")).toHaveLength(1);
    expect(rows.some((r) => r.detail === "read zone=zshop")).toBe(true);
    expect(JSON.stringify(rows)).not.toContain(secret);

    // The other changes say what they touched.
    const details = rows.map((r) => r.detail);
    expect(details.some((d) => d.startsWith("binding create consumer=bind-api provider="))).toBe(
      true,
    );
    expect(details.some((d) => d.startsWith("binding delete consumer=bind-api"))).toBe(true);
    expect(details.some((d) => d.startsWith("zone apply zone=zshop done="))).toBe(true);
    expect(details.some((d) => d.startsWith("exposure container=exp-web 80/tcp="))).toBe(true);
    expect(details.some((d) => d.startsWith("guard rules count="))).toBe(true);
    expect(details).toContain("guard disable all rules");
    // A plan changes nothing and does not fill the trail.
    expect(rows.some((r) => r.action.endsWith("/plan"))).toBe(false);

    // Filter by text: the history of one container.
    const mine = await trail("&q=container%3Dstandalone");
    expect(mine.length).toBeGreaterThanOrEqual(2);
    expect(mine.every((r) => r.detail.includes("container=standalone"))).toBe(true);
    // Wildcards in the search are plain characters.
    expect(
      (await trail("&q=%25")).every((r) => r.action.includes("%") || r.detail.includes("%")),
    ).toBe(true);
  });

  it("services with volumes, placement and secrets; a bad update rolls back; a manual rollback", async () => {
    type Svc = {
      id: string;
      image: string;
      running: number;
      desired: number;
      mounts: { source: string; target: string }[];
      placement: { nodeId?: string; role?: string; maxPerNode?: number };
      secrets: string[];
      update: { state: string | null };
    };
    const read = async (id: string) =>
      ((await call("GET", "/swarm/services")).json as Svc[]).find((x) => x.id === id) as Svc;
    expect((await call("POST", "/swarm/init", {})).res.status).toBe(201);
    const node = ((await call("GET", "/swarm/nodes")).json as { id: string }[])[0]?.id ?? "";
    await call("POST", "/swarm/secrets", { name: "db-pass", value: "never-returned" });

    const unknown = await call("POST", "/swarm/services", {
      name: "db",
      image: "postgres:16",
      secrets: ["nope"],
    });
    expect(unknown.res.status).toBe(422);
    expect(unknown.json.hintKey).toBe("errors.secretNotFound");

    const created = await call("POST", "/swarm/services", {
      name: "db",
      image: "postgres:16",
      mounts: [{ source: "db-data", target: "/var/lib/postgresql/data" }],
      secrets: ["db-pass"],
      placement: { nodeId: node, maxPerNode: 1 },
    });
    expect(created.res.status).toBe(201);
    const id = (created.json as { id: string }).id;
    const svc = await read(id);
    expect(svc.mounts).toEqual([
      { source: "db-data", target: "/var/lib/postgresql/data", readOnly: false },
    ]);
    expect(svc.secrets).toEqual(["db-pass"]);
    expect(svc.placement).toEqual({ nodeId: node, maxPerNode: 1 });
    expect(JSON.stringify((await call("GET", "/swarm/services")).json)).not.toContain(
      "never-returned",
    );

    // More copies than the node may hold stay pending, with the reason.
    await call("PATCH", `/swarm/services/${id}`, { replicas: 3 });
    expect((await read(id)).running).toBe(1);
    const tasks = (await call("GET", `/swarm/services/${id}/tasks`)).json as {
      state: string;
      error: string;
    }[];
    expect(tasks.filter((t) => t.state === "pending")).toHaveLength(2);
    expect(tasks.find((t) => t.state === "pending")?.error).toContain("max replicas");

    // A good update goes through; a bad image is undone by the engine and the image stays.
    await call("PATCH", `/swarm/services/${id}`, { replicas: 1, image: "postgres:17" });
    expect(await read(id)).toMatchObject({ image: "postgres:17", update: { state: "completed" } });
    await call("PATCH", `/swarm/services/${id}`, { image: "nautix/demo-fail:1" });
    expect(await read(id)).toMatchObject({
      image: "postgres:17",
      update: { state: "rollback_completed" },
    });

    // Manual rollback goes back to what the last update replaced.
    expect((await call("POST", `/swarm/services/${id}/rollback`)).res.status).toBe(204);
    expect((await read(id)).image).toBe("postgres:16");
    expect((await call("POST", `/swarm/services/${id}/rollback`)).res.status).toBe(409);

    await call("POST", "/swarm/leave", { force: true });
  });

  it("binds one swarm service to another: plan, apply, list, remove", async () => {
    type B = { id: string; consumer: string; provider: string; kind: string; variables: string[] };
    expect((await call("POST", "/swarm/init", {})).res.status).toBe(201);
    await call("POST", "/networks", { name: "bind-ov", driver: "overlay" });
    const web = await call("POST", "/swarm/services", {
      name: "web",
      image: "myorg/web:1",
      networks: ["bind-ov"],
    });
    await call("POST", "/swarm/services", {
      name: "db",
      image: "postgres:16",
      networks: ["bind-ov"],
      env: { POSTGRES_USER: "app", POSTGRES_PASSWORD: "s3cret-pw", POSTGRES_DB: "shop" },
    });
    const webId = (web.json as { id: string }).id;

    const plan = await call("GET", "/swarm/bindings/plan?consumer=web&provider=db");
    expect(plan.res.status).toBe(200);
    const planned = plan.json as {
      kind: string;
      network: string;
      joins: boolean;
      variables: { key: string; preview: string }[];
    };
    expect(planned).toMatchObject({ kind: "postgres", network: "bind-ov", joins: false });
    expect(planned.variables[0]?.key).toBe("ConnectionStrings__db");
    expect(JSON.stringify(plan.json)).not.toContain("s3cret-pw");

    expect(
      (await call("POST", "/swarm/bindings", { consumer: "web", provider: "web" })).res.status,
    ).toBe(422);
    const made = await call("POST", "/swarm/bindings", { consumer: "web", provider: "db" });
    expect(made.res.status).toBe(201);
    const binding = made.json as B;
    expect(binding).toMatchObject({ consumer: "web", provider: "db", kind: "postgres" });
    expect(JSON.stringify(made.json)).not.toContain("s3cret-pw");
    expect(
      (await call("POST", "/swarm/bindings", { consumer: "web", provider: "db" })).res.status,
    ).toBe(409);
    expect(((await call("GET", "/swarm/bindings")).json as B[]).map((b) => b.id)).toEqual([
      binding.id,
    ]);
    // The consumer's update shows as completed: the change reached the engine.
    const after = (
      (await call("GET", "/swarm/services")).json as {
        id: string;
        update: { state: string | null };
      }[]
    ).find((s) => s.id === webId);
    expect(after?.update.state).toBe("completed");

    expect((await call("DELETE", `/swarm/bindings/${binding.id}`)).res.status).toBe(204);
    expect(((await call("GET", "/swarm/bindings")).json as B[]).length).toBe(0);
    expect((await call("DELETE", `/swarm/bindings/${binding.id}`)).res.status).toBe(404);
    await call("POST", "/swarm/leave", { force: true });
  });

  it("creates overlay networks only on a swarm manager and reads the whole cluster in one call", async () => {
    type Net = {
      id: string;
      name: string;
      driver: string;
      encrypted?: boolean;
      attachable?: boolean;
    };
    const overlay = { name: "ov-shop", driver: "overlay", encrypted: true, attachable: true };

    // No swarm: the cluster read answers with its status and nothing else; an overlay is refused with a hint.
    const idle = await call("GET", "/swarm/cluster");
    expect(idle.res.status).toBe(200);
    expect(idle.json).toMatchObject({
      status: { active: false },
      nodes: [],
      services: [],
      tasks: [],
    });
    const refused = await call("POST", "/networks", overlay);
    expect(refused.res.status).toBe(409);
    expect(refused.json.hintKey).toBe("errors.overlayNeedsSwarm");
    // A plain network is not affected by any of this.
    expect((await call("POST", "/networks", { name: "ov-plain" })).res.status).toBe(201);

    process.env.NAUTIX_FAKE_SWARM_NODES = "3";
    try {
      expect((await call("POST", "/swarm/init", {})).res.status).toBe(201);
    } finally {
      Reflect.deleteProperty(process.env, "NAUTIX_FAKE_SWARM_NODES");
    }
    expect((await call("POST", "/networks", overlay)).res.status).toBe(201);
    const nets = (await call("GET", "/networks")).json as Net[];
    expect(nets.find((n) => n.name === "ov-shop")).toMatchObject({
      driver: "overlay",
      encrypted: true,
      attachable: true,
    });
    expect(nets.find((n) => n.name === "ov-plain")?.driver).toBe("bridge");

    for (const [name, replicas, global] of [
      ["ov-api", 3, false],
      ["ov-edge", 1, true],
    ] as const) {
      await call("POST", "/swarm/services", {
        name,
        image: "nginx:1.27",
        replicas,
        global,
        networks: ["ov-shop"],
      });
    }
    const cluster = (await call("GET", "/swarm/cluster")).json as {
      status: { active: boolean; isManager: boolean };
      nodes: { id: string; role: string }[];
      services: { id: string; name: string; networks: string[] }[];
      tasks: { serviceId: string; nodeId: string }[];
    };
    expect(cluster.status).toMatchObject({ active: true, isManager: true });
    expect(cluster.nodes).toHaveLength(3);
    expect(cluster.services.map((x) => [x.name, x.networks])).toEqual([
      ["ov-api", ["ov-shop"]],
      ["ov-edge", ["ov-shop"]],
    ]);
    const api = cluster.services.find((x) => x.name === "ov-api");
    const edge = cluster.services.find((x) => x.name === "ov-edge");
    // Three copies spread over three nodes; a global service has one on each.
    expect(
      new Set(cluster.tasks.filter((t) => t.serviceId === api?.id).map((t) => t.nodeId)).size,
    ).toBe(3);
    expect(cluster.tasks.filter((t) => t.serviceId === edge?.id)).toHaveLength(3);

    for (const x of cluster.services) await call("DELETE", `/swarm/services/${x.id}`);
    expect((await call("POST", "/swarm/leave", { force: true })).res.status).toBe(204);
    // Back to no swarm: the overlay is refused again.
    expect((await call("POST", "/networks", { ...overlay, name: "ov-late" })).res.status).toBe(409);
    for (const n of nets.filter((x) => x.name.startsWith("ov-")))
      await call("DELETE", `/networks/${n.id}`);
  });
});
