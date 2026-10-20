import { describe, expect, it } from "vitest";
import {
  addNamedVolume,
  addNetwork,
  addService,
  edit,
  formatPort,
  hasRisks,
  isPublic,
  parse,
  parsePort,
  readCompose,
  removeNetwork,
  removeService,
  renameService,
  setServiceEnv,
  setServiceList,
  setServiceScalar,
  validateCompose,
} from "./index.js";

const SAMPLE = `# Edge stack
name: demo

x-common: &common
  restart: unless-stopped # keep alive

services:
  proxy:
    <<: *common
    image: traefik:v3.1
    ports:
      - "127.0.0.1:8080:80" # loopback only
    networks: [edge, backend]
    depends_on:
      - api

  api:
    image: ghcr.io/acme/api:1.0
    environment:
      LOG_LEVEL: info
    networks:
      - backend

networks:
  edge: {}
  backend:
    internal: true
`;

describe("ports", () => {
  it("parses short and long syntax", () => {
    expect(parsePort("80")).toEqual({ container: "80", protocol: "tcp" });
    expect(parsePort("8080:80")).toEqual({ host: "8080", container: "80", protocol: "tcp" });
    expect(parsePort("127.0.0.1:8080:80/udp")).toEqual({
      ip: "127.0.0.1",
      host: "8080",
      container: "80",
      protocol: "udp",
    });
    expect(parsePort("[::1]:8080:80")).toMatchObject({ ip: "::1", host: "8080", container: "80" });
    expect(parsePort("8000-8010:8000-8010")).toMatchObject({ host: "8000-8010" });
    expect(parsePort({ target: 80, published: 8080, host_ip: "127.0.0.1" })).toMatchObject({
      ip: "127.0.0.1",
      host: "8080",
    });
  });

  it("rejects garbage", () => {
    for (const bad of ["", "abc", "80:80:80:80", "80/ftp", "a:b", "1.2.3.4:x:80"])
      expect(parsePort(bad)).toBeNull();
  });

  it("tells loopback from public and round-trips", () => {
    expect(isPublic(parsePort("127.0.0.1:80:80")!)).toBe(false);
    expect(isPublic(parsePort("8080:80")!)).toBe(true);
    expect(isPublic(parsePort("80")!)).toBe(true);
    expect(formatPort(parsePort("127.0.0.1:8080:80/udp")!)).toBe("127.0.0.1:8080:80/udp");
  });
});

describe("readCompose", () => {
  it("normalizes service shapes", () => {
    const model = readCompose(parse(SAMPLE));
    const proxy = model.services.find((s) => s.name === "proxy");
    expect(proxy).toMatchObject({
      image: "traefik:v3.1",
      ports: ["127.0.0.1:8080:80"],
      networks: ["edge", "backend"],
      dependsOn: ["api"],
    });
    expect(model.services.find((s) => s.name === "api")?.env).toEqual([["LOG_LEVEL", "info"]]);
    expect(model.networks).toEqual([
      { name: "edge", internal: false },
      { name: "backend", internal: true },
    ]);
  });

  it("accepts list-form environment, map-form networks and depends_on conditions", () => {
    const model = readCompose(
      parse(
        "services:\n  a:\n    image: x\n    environment:\n      - K=V\n      - BARE\n    networks:\n      n1: {}\n    depends_on:\n      b:\n        condition: service_started\n  b:\n    image: y\n",
      ),
    );
    expect(model.services[0]).toMatchObject({
      env: [
        ["K", "V"],
        ["BARE", ""],
      ],
      networks: ["n1"],
      dependsOn: ["b"],
    });
  });

  it("does not throw on odd shapes", () => {
    expect(readCompose(parse("services: 3")).services).toEqual([]);
    expect(readCompose(parse("")).services).toEqual([]);
  });
});

describe("edits keep the file intact", () => {
  it("a no-op edit is byte-exact", () => {
    expect(edit(SAMPLE, () => undefined)).toBe(SAMPLE);
  });

  it("changing one field touches only that field and keeps comments", () => {
    const next = edit(SAMPLE, (d) => setServiceScalar(d, "api", "restart", "always"));
    expect(next).toContain("# Edge stack");
    expect(next).toContain("# loopback only");
    expect(next).toContain("# keep alive");
    expect(next).toContain("restart: always");
    // Everything else is untouched: removing the one added line gives the original text back.
    expect(next.replace("    restart: always\n", "")).toBe(SAMPLE);
    const model = readCompose(parse(next));
    expect(model.services.find((s) => s.name === "api")?.restart).toBe("always");
  });

  it("refuses to rewrite a file with syntax errors", () => {
    const broken = "services:\n  a: [unclosed\n";
    expect(edit(broken, (d) => addService(d, "b", { image: "x" }))).toBe(broken);
  });

  it("adds services and creates the services map when missing", () => {
    const next = edit("name: x\n", (d) =>
      addService(d, "db", { image: "postgres:16", ports: ["127.0.0.1:5432:5432"] }),
    );
    expect(readCompose(parse(next)).services[0]).toMatchObject({
      name: "db",
      ports: ["127.0.0.1:5432:5432"],
    });
  });

  it("does not overwrite an existing service", () => {
    const next = edit(SAMPLE, (d) => addService(d, "api", { image: "evil" }));
    expect(next).toBe(SAMPLE);
  });

  it("removing a service drops depends_on references and empty keys", () => {
    const next = edit(SAMPLE, (d) => removeService(d, "api"));
    const proxy = readCompose(parse(next)).services.find((s) => s.name === "proxy");
    expect(proxy?.dependsOn).toEqual([]);
    expect(next).not.toContain("depends_on");
  });

  it("renaming a service updates dependents and keeps its body", () => {
    const next = edit(SAMPLE, (d) => renameService(d, "api", "backend-api"));
    const model = readCompose(parse(next));
    expect(model.services.map((s) => s.name)).toEqual(["proxy", "backend-api"]);
    expect(model.services[0]?.dependsOn).toEqual(["backend-api"]);
    expect(model.services[1]?.env).toEqual([["LOG_LEVEL", "info"]]);
  });

  it("removing a network detaches services and drops an empty section", () => {
    const next = edit(SAMPLE, (d) => {
      removeNetwork(d, "edge");
      removeNetwork(d, "backend");
    });
    expect(next).not.toMatch(/^networks:/m);
    expect(readCompose(parse(next)).services.every((s) => s.networks.length === 0)).toBe(true);
  });

  it("adds networks with options and edits lists and env", () => {
    let text = edit(SAMPLE, (d) =>
      addNetwork(d, "data", { internal: true, subnet: "10.5.0.0/24" }),
    );
    text = edit(text, (d) => setServiceList(d, "api", "networks", ["backend", "data"]));
    text = edit(text, (d) =>
      setServiceEnv(d, "api", [
        ["A", "1"],
        ["B", "two words"],
      ]),
    );
    const model = readCompose(parse(text));
    expect(model.networks.find((n) => n.name === "data")).toEqual({
      name: "data",
      internal: true,
      subnet: "10.5.0.0/24",
    });
    expect(model.services.find((s) => s.name === "api")).toMatchObject({
      networks: ["backend", "data"],
      env: [
        ["A", "1"],
        ["B", "two words"],
      ],
    });
  });

  it("an empty list removes the key", () => {
    const next = edit(SAMPLE, (d) => setServiceList(d, "proxy", "ports", []));
    expect(next).not.toContain("ports:");
  });
});

describe("validation", () => {
  const codes = (yaml: string) => validateCompose(parse(yaml)).map((i) => `${i.level}:${i.code}`);

  it("accepts the sample", () => {
    expect(validateCompose(parse(SAMPLE)).filter((i) => i.level === "error")).toEqual([]);
  });

  it("reports structural errors", () => {
    expect(codes("")).toContain("error:noServices");
    expect(codes("services:\n  a: {}\n")).toContain("error:noImage");
    expect(
      codes("services:\n  a:\n    image: x\n    depends_on: [ghost]\n    networks: [nope]\n"),
    ).toEqual(expect.arrayContaining(["error:unknownDependency", "error:unknownNetwork"]));
    expect(codes("services:\n  a:\n    image: x\n    ports: ['x:y']\n")).toContain(
      "error:invalidPort",
    );
  });

  it("reports yaml syntax errors", () => {
    expect(codes("services:\n  a: [oops\n")).toEqual(["error:yaml"]);
  });

  it("catches duplicate host ports and container names", () => {
    const yaml =
      "services:\n  a:\n    image: x\n    container_name: c\n    ports: ['8080:80']\n  b:\n    image: y\n    container_name: c\n    ports: ['8080:81']\n";
    expect(codes(yaml)).toEqual(
      expect.arrayContaining(["error:duplicateHostPort", "error:duplicateContainerName"]),
    );
  });

  it("warns about public ports and relative binds, not about loopback", () => {
    expect(
      codes(
        "services:\n  a:\n    image: x\n    ports: ['8080:80']\n    volumes: ['./conf:/etc/conf']\n",
      ),
    ).toEqual(expect.arrayContaining(["warning:publicPort", "warning:relativeBind"]));
    expect(
      codes("services:\n  a:\n    image: x\n    ports: ['127.0.0.1:8080:80']\n"),
    ).not.toContain("warning:publicPort");
  });

  it("flags dangerous features as risks", () => {
    const issues = validateCompose(
      parse(
        "services:\n  a:\n    image: x\n    privileged: true\n    network_mode: host\n    pid: host\n    cap_add: [SYS_ADMIN]\n    volumes: ['/var/run/docker.sock:/var/run/docker.sock']\n",
      ),
    );
    expect(
      issues
        .filter((i) => i.level === "risk")
        .map((i) => i.code)
        .sort(),
    ).toEqual(["dangerousCap", "dockerSocket", "hostNetwork", "hostPid", "privileged"]);
    expect(hasRisks(issues)).toBe(true);
    expect(hasRisks(validateCompose(parse(SAMPLE)))).toBe(false);
  });
});

describe("style of generated YAML", () => {
  it("writes block style even when the file started with `services: {}`", () => {
    const next = edit("services: {}\n", (d) =>
      addService(d, "web", { image: "nginx", ports: ["8080:80"] }),
    );
    expect(next).toBe('services:\n  web:\n    image: nginx\n    ports:\n      - "8080:80"\n');
  });

  it("quotes ports so they are never read as numbers", () => {
    const next = edit("services:\n  a:\n    image: x\n", (d) =>
      setServiceList(d, "a", "ports", ["8080:80", "127.0.0.1:81:81"]),
    );
    expect(next).toContain('- "8080:80"');
    expect(readCompose(parse(next)).services[0]?.ports).toEqual(["8080:80", "127.0.0.1:81:81"]);
  });

  it("adds named volumes and networks to empty maps in block style", () => {
    const next = edit("services:\n  a:\n    image: x\nvolumes: {}\nnetworks: {}\n", (d) => {
      addNamedVolume(d, "data");
      addNetwork(d, "edge", { internal: true });
    });
    expect(next).toContain("volumes:\n  data:");
    expect(next).toContain("networks:\n  edge:\n    internal: true");
  });
});
