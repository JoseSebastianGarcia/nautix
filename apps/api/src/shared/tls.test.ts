import { X509Certificate } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { createServer, request } from "node:https";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";
import { loadTls } from "./tls.js";

describe("tls", () => {
  it("is off by default and secure cookies follow it", () => {
    const config = loadConfig({});
    expect(config.tls.mode).toBe("off");
    expect(config.secureCookies).toBe(false);
    expect(loadConfig({ NAUTIX_TLS: "auto" }).secureCookies).toBe(true);
  });

  it("generates a certificate for localhost and extra hosts, then reuses it", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "nautix-tls-"));
    const config = loadConfig({
      NAUTIX_TLS: "auto",
      NAUTIX_DATA: dataDir,
      NAUTIX_TLS_HOSTS: "nautix.lan, 192.168.1.10",
    });
    const first = await loadTls(config);
    expect(first).toBeDefined();
    const cert = new X509Certificate(first?.cert ?? "");
    expect(cert.checkHost("localhost")).toBeDefined();
    expect(cert.checkHost("nautix.lan")).toBeDefined();
    expect(cert.checkIP("192.168.1.10")).toBeDefined();
    expect(cert.checkIP("127.0.0.1")).toBeDefined();
    const second = await loadTls(config);
    expect(second?.cert).toBe(first?.cert);
    expect(await readFile(join(dataDir, "tls", "cert.pem"), "utf8")).toBe(first?.cert);
  });

  it("serves HTTPS with the generated certificate", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "nautix-tls-"));
    const tls = await loadTls(loadConfig({ NAUTIX_TLS: "auto", NAUTIX_DATA: dataDir }));
    if (!tls) throw new Error("tls expected");
    const server = createServer(tls, (_req, res) => res.end("ok"));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    const body = await new Promise<string>((resolve, reject) => {
      request({ host: "127.0.0.1", port, ca: tls.cert, servername: "localhost" }, (res) => {
        let data = "";
        res.on("data", (c) => {
          data += String(c);
        });
        res.on("end", () => resolve(data));
      })
        .on("error", reject)
        .end();
    });
    server.close();
    expect(body).toBe("ok");
  });
});
