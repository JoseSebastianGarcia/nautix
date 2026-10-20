import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ProcessComposeRunner } from "./process-compose-runner.js";

let dir: string;
let fakeDocker: string;
const record = () => join(dir, "record.txt");

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "nx-compose-"));
  fakeDocker = join(dir, "docker");
  // Stand-in for the docker CLI: records its arguments, environment and stdin.
  writeFileSync(
    fakeDocker,
    `#!/bin/sh
{ echo "ARGS: $*"; echo "HOST: $DOCKER_HOST"; echo "SECRET: \${NAUTIX_SECRET:-unset}"; echo "STDIN:"; cat; } > "${record()}"
case "$*" in *boom*) echo "failure output" >&2; exit 3;; esac
echo "ok output"
`,
  );
  chmodSync(fakeDocker, 0o755);
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

const runner = (timeoutMs = 5000) =>
  new ProcessComposeRunner({
    dockerBin: fakeDocker,
    dataDir: dir,
    socketPath: "/var/run/docker.sock",
    timeoutMs,
  });

describe("ProcessComposeRunner", () => {
  it("passes the file on stdin and builds the arguments without a shell", async () => {
    process.env.NAUTIX_SECRET = "must-not-leak";
    const result = await runner().run({
      project: "demo",
      content: "services: {}\n",
      action: "up",
      removeVolumes: false,
    });
    delete process.env.NAUTIX_SECRET;
    expect(result).toMatchObject({ ok: true, exitCode: 0 });
    expect(result.output).toContain("ok output");
    const seen = readFileSync(record(), "utf8");
    expect(seen).toContain(
      "ARGS: compose --ansi never --progress plain --project-name demo -f - up -d --remove-orphans",
    );
    expect(seen).toContain("HOST: unix:///var/run/docker.sock");
    expect(seen).toContain("SECRET: unset");
    expect(seen).toContain("services: {}");
  });

  it("only removes volumes when asked", async () => {
    await runner().run({ project: "demo", content: "x", action: "down", removeVolumes: true });
    expect(readFileSync(record(), "utf8")).toContain("down --remove-orphans --volumes");
    await runner().run({ project: "demo", content: "x", action: "down", removeVolumes: false });
    expect(readFileSync(record(), "utf8")).not.toContain("--volumes");
  });

  it("runs ps, logs and build with fixed arguments", async () => {
    for (const [action, args] of [
      ["ps", "ps --all"],
      ["logs", "logs --no-color --timestamps --tail 200"],
      ["build", "build"],
    ] as const) {
      await runner().run({ project: "demo", content: "x", action, removeVolumes: false });
      expect(readFileSync(record(), "utf8")).toContain(`-f - ${args}`);
    }
  });

  it("reports failures with their output", async () => {
    const result = await runner().run({
      project: "boom",
      content: "x",
      action: "pull",
      removeVolumes: false,
    });
    expect(result).toMatchObject({ ok: false, exitCode: 3 });
    expect(result.output).toContain("failure output");
  });

  it("reports a missing docker binary instead of crashing", async () => {
    const missing = new ProcessComposeRunner({
      dockerBin: join(dir, "nope"),
      dataDir: dir,
      socketPath: "/s",
      timeoutMs: 1000,
    });
    const result = await missing.run({
      project: "demo",
      content: "x",
      action: "config",
      removeVolumes: false,
    });
    expect(result.ok).toBe(false);
    expect(result.output).toContain("could not start docker");
  });
});
