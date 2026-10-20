import "reflect-metadata";
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
