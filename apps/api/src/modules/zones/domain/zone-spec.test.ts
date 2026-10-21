import type { Binding } from "@nautix/contracts";
import { describe, expect, it } from "vitest";
import { describeZone, volumeString, type ZoneContainer, type ZoneFacts } from "./describe-zone.js";
import { planZone } from "./plan-zone.js";
import { parseZoneSpec, stringifyZoneSpec } from "./zone-yaml.js";

const DOC = `
version: 1
zone:
  name: shop
services:
  db:
    image: postgres:16-alpine
    env:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: pw
    volumes: ["db-data:/var/lib/postgresql/data"]
  api:
    image: myorg/api:1
    ports:
      - { container: 8080, host: 8080, expose: local }
    env: { MODE: prod }
    bindings:
      - { to: db, name: Orders }
`;

const spec = (text = DOC) => {
  const parsed = parseZoneSpec(text);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
  return parsed.spec;
};

const container = (
  over: Partial<ZoneContainer> & { name: string; image: string },
): ZoneContainer => ({
  env: {},
  command: null,
  restartPolicy: "unless-stopped",
  volumes: [],
  ports: [],
  ...over,
});

/** Reality that matches DOC exactly, with its binding recorded. */
const matching = (): ZoneFacts => ({
  network: { name: "shop", internal: false },
  containers: [
    container({
      name: "db",
      image: "postgres:16-alpine",
      env: { POSTGRES_USER: "app", POSTGRES_PASSWORD: "pw" },
      volumes: ["db-data:/var/lib/postgresql/data"],
    }),
    container({
      name: "api",
      image: "myorg/api:1",
      env: { MODE: "prod", ConnectionStrings__Orders: "Host=db;..." },
      ports: [{ privatePort: 8080, type: "tcp", publicPort: 8080, ip: "127.0.0.1" }],
    }),
  ],
  outside: [],
  bindings: [
    {
      id: "b1",
      consumer: "api",
      provider: "db",
      kind: "postgres",
      name: "Orders",
      style: "dotnet",
      variables: ["ConnectionStrings__Orders"],
    } satisfies Binding,
  ],
});

describe("zone document", () => {
  it("parses, fills defaults and writes back a document without them", () => {
    const s = spec();
    expect(s.services.api?.ports[0]).toEqual({
      container: 8080,
      protocol: "tcp",
      host: 8080,
      expose: "local",
    });
    expect(s.services.db?.restart).toBe("unless-stopped");
    const text = stringifyZoneSpec(s);
    expect(text).not.toContain("restart");
    expect(text).not.toContain("expose");
    expect(text).not.toContain("style");
    expect(spec(text)).toEqual(s);
  });

  it("reports every problem with where it is", () => {
    const bad = parseZoneSpec(`
version: 1
zone: { name: shop, extra: 1 }
services:
  api:
    image: x
    ports: [{ container: 99999 }, { container: 80, expose: nowhere }]
    bindings: [{ to: ghost }, { to: api }]
    typo: 1
`);
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    const paths = bad.errors.map((e) => e.path);
    expect(paths).toContain("zone");
    expect(paths).toContain("services.api");
    expect(paths).toContain("services.api.ports.0.container");
    expect(paths).toContain("services.api.ports.1.expose");
    expect(paths).toContain("services.api.bindings.0.to");
    expect(paths).toContain("services.api.bindings.1.to");
  });

  it("refuses broken YAML, a wrong version, a host port given twice and a duplicated binding name", () => {
    expect(parseZoneSpec("a: [").ok).toBe(false);
    expect(parseZoneSpec("version: 2\nzone: { name: a }").ok).toBe(false);
    const clash = parseZoneSpec(`
version: 1
zone: { name: z }
services:
  a: { image: x, ports: [{ container: 80, host: 8080 }] }
  b: { image: x, ports: [{ container: 81, host: 8080 }] }
`);
    expect(clash.ok).toBe(false);
    const twice = parseZoneSpec(`
version: 1
zone: { name: z }
services:
  a: { image: x, bindings: [{ to: b }, { to: b }] }
  b: { image: x }
`);
    expect(twice.ok).toBe(false);
  });
});

describe("describeZone", () => {
  it("reads reality as a document, hides binding variables and shows the binding", () => {
    const s = describeZone("shop", matching());
    expect(s.services.api?.env).toEqual({ MODE: "prod" });
    expect(s.services.api?.bindings).toEqual([{ to: "db", name: "Orders", style: "dotnet" }]);
    expect(s.services.api?.ports).toEqual([
      { container: 8080, protocol: "tcp", host: 8080, expose: "local" },
    ]);
  });

  it("maps host addresses to local, open or the address, and counts IPv4 and IPv6 once", () => {
    const facts = matching();
    facts.containers[1] = container({
      name: "api",
      image: "myorg/api:1",
      ports: [
        { privatePort: 80, type: "tcp", publicPort: 80, ip: "0.0.0.0" },
        { privatePort: 80, type: "tcp", publicPort: 80, ip: "::" },
        { privatePort: 81, type: "tcp", publicPort: 81, ip: "192.168.1.5" },
        { privatePort: 82, type: "tcp" },
      ],
    });
    expect(
      describeZone("shop", facts).services.api?.ports.map((p) => [p.container, p.expose]),
    ).toEqual([
      [80, "open"],
      [81, "192.168.1.5"],
    ]);
  });

  it("writes anonymous volumes as their path and read-only mounts with :ro", () => {
    const anon = "a".repeat(64);
    expect(volumeString({ type: "volume", source: anon, target: "/data", readOnly: false })).toBe(
      "/data",
    );
    expect(volumeString({ type: "bind", source: "/srv", target: "/site", readOnly: true })).toBe(
      "/srv:/site:ro",
    );
    expect(volumeString({ type: "tmpfs", source: "", target: "/tmp", readOnly: false })).toBeNull();
  });
});

describe("planZone", () => {
  it("is empty when reality already matches the document", () => {
    const plan = planZone(spec(), matching());
    expect(plan.actions).toEqual([]);
    expect(plan.errors).toEqual([]);
  });

  it("builds everything from nothing: network, services, then bindings", () => {
    const plan = planZone(spec(), { network: null, containers: [], outside: [], bindings: [] });
    expect(plan.actions.map((a) => a.kind)).toEqual([
      "create-network",
      "create-service",
      "create-service",
      "add-binding",
    ]);
    expect(plan.actions[3]).toEqual({
      kind: "add-binding",
      consumer: "api",
      provider: "db",
      name: "Orders",
      style: "dotnet",
    });
  });

  it("changes what can change in place with an update", () => {
    const s = spec(
      DOC.replace("MODE: prod", "MODE: staging").replace("myorg/api:1", "myorg/api:2"),
    );
    const plan = planZone(s, matching());
    expect(plan.actions).toEqual([
      { kind: "update-service", service: "api", fields: ["image", "env"] },
    ]);
  });

  it("changes the exposure or the host port of a published port in place", () => {
    const open = planZone(spec(DOC.replace("expose: local", "expose: open")), matching());
    expect(open.actions).toEqual([{ kind: "update-service", service: "api", fields: ["ports"] }]);
    const moved = planZone(spec(DOC.replace("host: 8080", "host: 9090")), matching());
    expect(moved.actions).toEqual([{ kind: "update-service", service: "api", fields: ["ports"] }]);
  });

  it("replaces a service whose volumes or set of ports change, and starts its bindings over", () => {
    const s = spec(DOC.replace("container: 8080, host: 8080", "container: 9000, host: 8080"));
    const plan = planZone(s, matching());
    expect(plan.actions).toEqual([
      { kind: "replace-service", service: "api", fields: ["ports"] },
      { kind: "add-binding", consumer: "api", provider: "db", name: "Orders", style: "dotnet" },
    ]);
  });

  it("warns when replacing loses an anonymous volume", () => {
    const facts = matching();
    facts.containers[0] = container({
      name: "db",
      image: "postgres:16-alpine",
      env: { POSTGRES_USER: "app", POSTGRES_PASSWORD: "pw" },
      volumes: ["/var/lib/postgresql/data"],
    });
    const plan = planZone(spec(), facts);
    expect(plan.actions[0]).toMatchObject({ kind: "replace-service", service: "db" });
    expect(plan.warnings).toContainEqual({ key: "anonymousVolumeLost", params: { service: "db" } });
  });

  it("rewrites the consumers when the service they read from changes", () => {
    const plan = planZone(
      spec(DOC.replace("POSTGRES_PASSWORD: pw", "POSTGRES_PASSWORD: new")),
      matching(),
    );
    expect(plan.actions).toEqual([
      { kind: "update-service", service: "db", fields: ["env"] },
      { kind: "reapply-binding", consumer: "api", provider: "db", name: "Orders" },
    ]);
  });

  it("adds, removes and changes bindings", () => {
    const without = spec(DOC.replace("    bindings:\n      - { to: db, name: Orders }\n", ""));
    expect(planZone(without, matching()).actions).toEqual([
      { kind: "remove-binding", consumer: "api", provider: "db", name: "Orders" },
    ]);
    const restyled = spec(DOC.replace("name: Orders }", "name: Orders, style: url }"));
    expect(planZone(restyled, matching()).actions.map((a) => a.kind)).toEqual([
      "remove-binding",
      "add-binding",
    ]);
  });

  it("lists containers that are not in the document as removals", () => {
    const facts = matching();
    facts.containers.push(container({ name: "old", image: "nginx" }));
    const plan = planZone(spec(), facts);
    expect(plan.actions).toEqual([{ kind: "remove-service", service: "old" }]);
    expect(plan.warnings).toContainEqual({ key: "removesService", params: { service: "old" } });
  });

  it("refuses a service name that belongs to a container outside the zone", () => {
    const plan = planZone(spec(), { network: null, containers: [], outside: ["db"], bindings: [] });
    expect(plan.errors).toEqual([{ key: "nameTakenOutside", params: { service: "db" } }]);
    expect(plan.actions.some((a) => a.kind === "create-service" && a.service === "db")).toBe(false);
  });

  it("gives the same hash for the same plan and a different one when anything changes", () => {
    const a = planZone(spec(DOC.replace("MODE: prod", "MODE: x")), matching());
    const b = planZone(spec(DOC.replace("MODE: prod", "MODE: x")), matching());
    const c = planZone(spec(DOC.replace("MODE: prod", "MODE: y")), matching());
    expect(a.hash).toBe(b.hash);
    expect(c.actions).toEqual(a.actions); // same kind of change...
    const d = planZone(
      spec(DOC.replace("MODE: prod", "MODE: x").replace("image: myorg/api:1", "image: other")),
      matching(),
    );
    expect(d.hash).not.toBe(a.hash);
  });
});
