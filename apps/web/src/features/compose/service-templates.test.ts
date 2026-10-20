import { findTemplate, TEMPLATES } from "@nautix/contracts";
import { describe, expect, it } from "vitest";
import { pickHostPort, templateToService } from "./service-templates.js";

const opts = { usedHostPorts: new Set<number>(), random: () => "rnd" };

describe("service templates", () => {
  it("picks the next free host port", () => {
    expect(pickHostPort(80, new Set([80, 81]))).toBe(82);
    expect(pickHostPort(80, new Set())).toBe(80);
  });

  it("binds to loopback, uses named volumes and randomizes secrets", () => {
    const pg = findTemplate("postgres");
    expect(pg).toBeDefined();
    const svc = templateToService(pg!, "db", { ...opts, box: "backend" });
    expect(svc.definition).toMatchObject({
      image: "postgres:16-alpine",
      ports: ["127.0.0.1:5432:5432"],
      environment: { POSTGRES_PASSWORD: "rnd" },
      volumes: ["db-data:/var/lib/postgresql/data"],
      networks: ["backend"],
    });
    expect(svc.volumes).toEqual(["db-data"]);
  });

  it("avoids host ports already used, including within the same service", () => {
    const kong = findTemplate("kong");
    const svc = templateToService(kong!, "gw", { ...opts, usedHostPorts: new Set([8000]) });
    expect(svc.definition.ports).toEqual(["127.0.0.1:8001:8000", "127.0.0.1:8002:8001"]);
  });

  it("every catalog template yields a service with an image and no public ports", () => {
    for (const t of TEMPLATES) {
      const svc = templateToService(t, t.id, opts);
      expect(svc.definition.image).toBe(t.image);
      for (const p of (svc.definition.ports as string[] | undefined) ?? [])
        expect(p.startsWith("127.0.0.1:")).toBe(true);
    }
  });
});
