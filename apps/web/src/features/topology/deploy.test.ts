import { findTemplate, TEMPLATES } from "@nautix/contracts";
import { describe, expect, it } from "vitest";
import {
  deployBlockers,
  emptyMount,
  formatEnv,
  joinCommand,
  mountBinds,
  mountProblems,
  namedVolumes,
  parseEnv,
  randomizeSecrets,
  randomSecret,
  splitCommand,
  uniqueName,
} from "./deploy.js";

describe("joinCommand", () => {
  it("makes the long placeholder at least 32 characters", () => {
    expect(randomizeSecrets({ K: "change-me-long" }, () => "x".repeat(24))["K"]?.length).toBe(48);
  });

  it("round-trips every template command through the deploy dialog's text field", () => {
    const withCommand = TEMPLATES.filter((t) => t.command);
    expect(withCommand.length).toBeGreaterThan(0);
    for (const t of withCommand)
      expect(splitCommand(joinCommand(t.command ?? []))).toEqual(t.command);
  });

  it("quotes only what needs it", () => {
    expect(joinCommand(["a", "b c", "", 'd"e'])).toBe(`a "b c" "" 'd"e'`);
  });
});

describe("deploy helpers", () => {
  it("round-trips env text and ignores comments", () => {
    const env = parseEnv("# c\nA=1\nB=x=y\n\nbad");
    expect(env).toEqual({ A: "1", B: "x=y" });
    expect(parseEnv(formatEnv(env))).toEqual(env);
  });

  it("replaces only placeholder secrets", () => {
    expect(randomizeSecrets({ P: "change-me", Q: "keep" }, () => "rnd")).toEqual({
      P: "rnd",
      Q: "keep",
    });
  });

  it("finds a free name", () => {
    expect(uniqueName("redis", ["redis", "redis-2"])).toBe("redis-3");
    expect(uniqueName("redis", [])).toBe("redis");
  });

  it("turns data paths into named volumes", () => {
    expect(namedVolumes("db", ["/var/lib/data", "/etc/x"])).toEqual([
      "db-data:/var/lib/data",
      "db-data-2:/etc/x",
    ]);
  });

  it("generates secrets that satisfy common password policies", () => {
    for (let i = 0; i < 200; i++) {
      const secret = randomSecret();
      expect(secret).toHaveLength(24);
      expect(secret).toMatch(/[A-Z]/);
      expect(secret).toMatch(/[a-z]/);
      expect(secret).toMatch(/[0-9]/);
      expect(secret).toMatch(/^[A-Za-z0-9]+$/);
    }
  });

  it("splits commands with quotes and no shell", () => {
    expect(splitCommand("--a=1  --b 'two words' \"x y\"")).toEqual([
      "--a=1",
      "--b",
      "two words",
      "x y",
    ]);
    expect(splitCommand("")).toEqual([]);
    expect(splitCommand("sh -c ''")).toEqual(["sh", "-c", ""]);
  });
});

describe("folder mappings in the deploy dialog", () => {
  it("starts from the template's own mounts", () => {
    const mounts = findTemplate("floci-aws")?.mounts ?? [];
    expect(mounts).toEqual([{ source: "/var/run/docker.sock", target: "/var/run/docker.sock" }]);
  });

  it("turns rows into the binds the API receives, skipping empty rows", () => {
    expect(
      mountBinds([
        { source: "/srv/site", target: "/html", readOnly: true },
        { source: "/srv/logs", target: "/logs", readOnly: false },
        emptyMount(),
      ]),
    ).toEqual(["/srv/site:/html:ro", "/srv/logs:/logs"]);
  });

  it("explains a row that is half filled or not absolute", () => {
    expect(mountProblems({ source: "/srv/a", target: "", readOnly: false })).toBe("target");
    expect(mountProblems({ source: "", target: "/a", readOnly: false })).toBe("source");
    expect(mountProblems({ source: "data", target: "/a", readOnly: false })).toBe("source");
    expect(mountProblems({ source: "/srv/a", target: "data", readOnly: false })).toBe("target");
    expect(mountProblems({ source: "/srv/a", target: "/a", readOnly: false })).toBeNull();
    expect(mountProblems(emptyMount())).toBeNull();
  });

  it("blocks Deploy until every risky mount is explicitly accepted", () => {
    const socket = [
      { source: "/var/run/docker.sock", target: "/var/run/docker.sock", readOnly: false },
    ];
    expect(deployBlockers(socket, [])).toEqual(["docker-socket"]);
    expect(deployBlockers(socket, ["docker-socket"])).toEqual([]);
    expect(deployBlockers([{ source: "/srv/a", target: "/a", readOnly: false }], [])).toEqual([]);
  });

  it("the cloud emulators carry the socket, so each one needs that consent", () => {
    for (const id of ["floci-aws", "floci-azure", "floci-gcp", "floci-oci"]) {
      const t = findTemplate(id);
      expect(t?.category).toBe("cloud");
      const rows = (t?.mounts ?? []).map((m) => ({ ...m, readOnly: m.readOnly ?? false }));
      expect(deployBlockers(rows, [])).toEqual(["docker-socket"]);
    }
  });

  it("publishes the Azure AMQP ports and does not publish the AWS console port", () => {
    const azure = findTemplate("floci-azure")?.ports.map((p) => p.containerPort);
    expect(azure).toEqual(expect.arrayContaining([4577, 5672, 5673]));
    // Floci starts the console itself as a separate container on host port 4500.
    const aws = findTemplate("floci-aws")?.ports.map((p) => p.containerPort);
    expect(aws).toEqual([4566]);
  });

  it("has a Floci web console template that needs no consent and points at the emulators by name", () => {
    const ui = findTemplate("floci-ui");
    expect(ui?.category).toBe("cloud");
    expect(ui?.image).toMatch(/^floci\/floci-ui:\d/);
    expect(ui?.ports.map((p) => p.containerPort)).toEqual([4500]);
    expect(ui?.mounts ?? []).toEqual([]);
    // The default container names of the emulator templates, so the console finds them in the same box.
    expect(ui?.env).toMatchObject({
      FLOCI_ENDPOINT: "http://floci-aws:4566",
      FLOCI_AZURE_ENDPOINT: "http://floci-azure:4577",
      FLOCI_GCP_ENDPOINT: "http://floci-gcp:4588",
      FLOCI_OCI_ENDPOINT: "http://floci-oci:4599",
    });
  });

  it("Floci AWS leaves the console to the web console template, so the two never fight for port 4500", () => {
    expect(findTemplate("floci-aws")?.env).toMatchObject({ FLOCI_SERVICES_UI_ENABLED: "false" });
  });
});
