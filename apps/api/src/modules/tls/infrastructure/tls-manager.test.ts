import { createPublicKey, X509Certificate } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { createServer, request } from "node:https";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generate } from "selfsigned";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../../../shared/config.js";
import { TlsManager } from "./tls-manager.js";

const make = async (env: Record<string, string> = {}) => {
  const dataDir = await mkdtemp(join(tmpdir(), "nautix-tls-"));
  const config = loadConfig({ NAUTIX_TLS: "auto", NAUTIX_DATA: dataDir, ...env });
  const manager = await TlsManager.create(config);
  if (!manager) throw new Error("tls expected");
  await manager.init();
  return { manager, config };
};

const get = (port: number, ca: string): Promise<string> =>
  new Promise((resolve, reject) => {
    request({ host: "127.0.0.1", port, ca, servername: "localhost" }, (res) => {
      let data = "";
      res.on("data", (c) => {
        data += String(c);
      });
      res.on("end", () => resolve(data));
    })
      .on("error", reject)
      .end();
  });

describe("TlsManager", () => {
  it("is off by default and secure cookies follow it", () => {
    expect(loadConfig({}).tls.mode).toBe("off");
    expect(loadConfig({}).secureCookies).toBe(false);
    expect(loadConfig({ NAUTIX_TLS: "auto" }).secureCookies).toBe(true);
  });

  it("issues a leaf signed by a local CA that covers the configured names", async () => {
    const { manager } = await make({ NAUTIX_TLS_HOSTS: "nautix.lan, 192.168.1.10" });
    const leaf = new X509Certificate(manager.material().cert);
    const ca = new X509Certificate(manager.caPem() ?? "");
    expect(leaf.verify(ca.publicKey)).toBe(true);
    expect(ca.ca).toBe(true);
    expect(leaf.ca).toBe(false);
    expect(leaf.checkHost("localhost")).toBeDefined();
    expect(leaf.checkHost("nautix.lan")).toBeDefined();
    expect(leaf.checkIP("192.168.1.10")).toBeDefined();
    expect(manager.status().mode).toBe("local-ca");
    expect(manager.status().ca?.fingerprint).toBe(ca.fingerprint256);
  });

  it("serves a certificate that validates against the CA only, and reissues on host changes", async () => {
    const { manager } = await make();
    const server = createServer(manager.material(), (_req, res) => res.end("ok"));
    manager.attach(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    const ca = manager.caPem() ?? "";
    expect(await get(port, ca)).toBe("ok");
    await expect(get(port, "")).rejects.toThrow();

    const before = manager.material().cert;
    const status = await manager.setHosts(["Nautix.Lan"]);
    expect(status.hosts).toContain("nautix.lan");
    expect(manager.material().cert).not.toBe(before);
    expect(await get(port, ca)).toBe("ok");
    server.close();
  });

  it("rejects bad host names", async () => {
    const { manager } = await make();
    await expect(manager.setHosts(["bad host!"])).rejects.toThrow();
  });

  it("keeps the CA when it restarts, and accepts a matching custom certificate", async () => {
    const { manager, config } = await make();
    const again = await TlsManager.create(config);
    await again?.init();
    expect(again?.caPem()).toBe(manager.caPem());

    const own = await generate([{ name: "commonName", value: "own" }], { keyType: "ec" });
    await expect(manager.setCustom(own.cert, "nope")).rejects.toThrow();
    const other = await generate([{ name: "commonName", value: "x" }], { keyType: "ec" });
    await expect(manager.setCustom(own.cert, other.private)).rejects.toThrow();
    const status = await manager.setCustom(own.cert, own.private);
    expect(status.mode).toBe("custom");
    expect(manager.material().cert).toBe(own.cert);
    expect(createPublicKey(own.cert).type).toBe("public");
    expect((await manager.removeCustom()).mode).toBe("local-ca");
  });
});
