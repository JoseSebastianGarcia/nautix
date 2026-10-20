import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SocketTerminalEngine } from "./socket-terminal-engine.js";

let server: Server;
let dir: string;
let engine: SocketTerminalEngine;
const requests: string[] = [];

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "nx-term-"));
  const socketPath = join(dir, "docker.sock");
  server = createServer((req, res) => {
    requests.push(`${req.method} ${req.url}`);
    let body = "";
    req.on("data", (c) => {
      body += c;
    });
    req.on("end", () => {
      if (req.url?.includes("/containers/gone/exec")) return res.writeHead(404).end("{}");
      if (req.url?.includes("/containers/abc/exec")) {
        expect(JSON.parse(body).Tty).toBe(true);
        return res.writeHead(201, { "content-type": "application/json" }).end('{"Id":"exec1"}');
      }
      res.writeHead(200).end();
    });
  });
  // Engine hijack: reply 101 and echo bytes back upper-cased.
  server.on("upgrade", (_req, socket) => {
    socket.write("HTTP/1.1 101 UPGRADED\r\nConnection: Upgrade\r\nUpgrade: tcp\r\n\r\nready> ");
    socket.on("data", (d) => socket.write(d.toString().toUpperCase()));
  });
  await new Promise<void>((r) => server.listen(socketPath, r));
  engine = new SocketTerminalEngine(socketPath);
});

afterAll(() => {
  server.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("SocketTerminalEngine", () => {
  it("creates an exec, hijacks the connection and streams both ways", async () => {
    const channel = await engine.open("abc", 100, 30);
    const received: string[] = [];
    channel.onData((c) => received.push(c.toString()));
    await new Promise((r) => setTimeout(r, 50));
    channel.write("ls\n");
    await new Promise((r) => setTimeout(r, 50));
    expect(received.join("")).toContain("ready> ");
    expect(received.join("")).toContain("LS");
    await new Promise((r) => setTimeout(r, 50));
    expect(requests).toContain("POST /v1.43/exec/exec1/resize?h=30&w=100");
    channel.close();
  });

  it("maps a missing container to not found", async () => {
    await expect(engine.open("gone", 80, 24)).rejects.toMatchObject({ status: 404 });
  });
});
