import { execFileSync, spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import type { GuardBackend, GuardPlanDoc, ResolvedGuardRule } from "@nautix/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Executor, GuardHelper } from "./helper-runner.js";

/**
 * Enforces rules with the real host firewall and real traffic between two Docker networks. Needs
 * root with NET_ADMIN, iptables and nft, and a Docker daemon; skips itself where they are missing.
 * It plays Docker's part by providing the DOCKER-USER chain when the daemon does not manage iptables.
 */
const IMAGE = "alpine:3.20";
const NET_CLIENT = "nxgt-client";
const NET_SERVER = "nxgt-server";
const SERVER_IP = "10.77.2.10";
const CLIENT_IP = "10.77.1.10";

const sh = (cmd: string, ...args: string[]): { code: number; out: string } => {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  return { code: r.status ?? 1, out: `${r.stdout}${r.stderr}`.trim() };
};
const docker = (...args: string[]): string =>
  execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

const exec: Executor = {
  async write(path, content) {
    writeFileSync(path, content);
  },
  async run(argv, stdin) {
    const [bin, ...rest] = argv;
    const r = spawnSync(bin ?? "", rest, { encoding: "utf8", input: stdin });
    return { code: r.status ?? 1, output: `${r.stdout}${r.stderr}` };
  },
};

const available = ((): boolean => {
  try {
    docker("version");
    return (
      process.getuid?.() === 0 &&
      sh("iptables", "-S").code === 0 &&
      sh("ip6tables", "-S").code === 0 &&
      sh("nft", "list", "ruleset").code === 0 &&
      sh("sysctl", "-n", "net.ipv4.ip_forward").out === "1"
    );
  } catch {
    return false;
  }
})();

const reaches = (): boolean => {
  const r = spawnSync(
    "docker",
    ["exec", "nxgt-cli", "sh", "-c", `nc -w 2 ${SERVER_IP} 8080 </dev/null`],
    { encoding: "utf8" },
  );
  return r.stdout.includes("pong");
};

const enforce = async (backend: GuardBackend, rules: ResolvedGuardRule[], revision: number) => {
  const doc: GuardPlanDoc = { revision, rules, fallback: null, validUntil: null };
  const helper = new GuardHelper(backend, {
    exec,
    now: Date.now,
    fetchPlan: async () => doc,
    report: async () => undefined,
  });
  await helper.tick();
  return helper;
};

let madeDockerUser = false;

describe.skipIf(!available)("host firewall (real iptables / nftables, real traffic)", () => {
  beforeAll(() => {
    for (const n of [NET_CLIENT, NET_SERVER]) sh("docker", "network", "rm", n);
    docker("network", "create", "--subnet", "10.77.1.0/24", NET_CLIENT);
    docker("network", "create", "--subnet", "10.77.2.0/24", NET_SERVER);
    sh("docker", "rm", "-f", "nxgt-srv", "nxgt-cli");
    docker(
      "run",
      "-d",
      "--name",
      "nxgt-srv",
      "--network",
      NET_SERVER,
      "--ip",
      SERVER_IP,
      IMAGE,
      "sh",
      "-c",
      "while true; do echo pong | nc -l -p 8080; done",
    );
    docker(
      "run",
      "-d",
      "--name",
      "nxgt-cli",
      "--network",
      NET_CLIENT,
      "--ip",
      CLIENT_IP,
      IMAGE,
      "sleep",
      "600",
    );
    if (sh("iptables", "-S", "DOCKER-USER").code !== 0) {
      madeDockerUser = true;
      sh("iptables", "-N", "DOCKER-USER");
      sh("iptables", "-I", "FORWARD", "-j", "DOCKER-USER");
    }
    expect(reaches()).toBe(true); // nothing guards the port yet
  });

  afterAll(() => {
    sh("docker", "rm", "-f", "-v", "nxgt-srv", "nxgt-cli");
    for (const n of [NET_CLIENT, NET_SERVER]) sh("docker", "network", "rm", n);
    sh("iptables", "-D", "DOCKER-USER", "-j", "NAUTIX-GUARD");
    sh("iptables", "-F", "NAUTIX-GUARD");
    sh("iptables", "-X", "NAUTIX-GUARD");
    sh("ip6tables", "-D", "DOCKER-USER", "-j", "NAUTIX-GUARD");
    sh("ip6tables", "-F", "NAUTIX-GUARD");
    sh("ip6tables", "-X", "NAUTIX-GUARD");
    sh("nft", "delete", "table", "inet", "nautix_guard");
    if (madeDockerUser) {
      sh("iptables", "-D", "FORWARD", "-j", "DOCKER-USER");
      sh("iptables", "-F", "DOCKER-USER");
      sh("iptables", "-X", "DOCKER-USER");
    }
  });

  it.each<GuardBackend>(["iptables", "nftables"])(
    "%s lets a listed network through, drops the rest and stops guarding when removed",
    async (backend) => {
      const listed: ResolvedGuardRule = {
        hostPort: 8080,
        protocol: "tcp",
        allow: ["10.77.1.0/24"],
      };
      const other: ResolvedGuardRule = { hostPort: 8080, protocol: "tcp", allow: ["10.99.0.0/16"] };
      const otherPort: ResolvedGuardRule = {
        hostPort: 9090,
        protocol: "tcp",
        allow: ["10.99.0.0/16"],
      };

      await enforce(backend, [listed], 1);
      expect(reaches()).toBe(true);

      await enforce(backend, [other], 2);
      expect(reaches()).toBe(false);

      // a rule for a different port leaves this one alone
      const helper = await enforce(backend, [otherPort], 3);
      expect(reaches()).toBe(true);

      await enforce(backend, [other], 4);
      expect(reaches()).toBe(false);

      // the emergency switch and an empty rule set both take the guard away
      const removed = await helper.removeAll();
      expect(removed.ok).toBe(true);
      expect(reaches()).toBe(true);
    },
  );

  it("applying the same rules twice leaves a single jump in DOCKER-USER", async () => {
    const rule: ResolvedGuardRule = { hostPort: 8080, protocol: "tcp", allow: ["10.77.1.0/24"] };
    await enforce("iptables", [rule], 1);
    await enforce("iptables", [{ ...rule, allow: ["10.77.1.0/24", "10.77.3.0/24"] }], 2);
    const jumps = sh("iptables", "-S", "DOCKER-USER")
      .out.split("\n")
      .filter((l) => l.includes("NAUTIX-GUARD"));
    expect(jumps).toHaveLength(1);
    await enforce("iptables", [], 3);
    expect(sh("iptables", "-S").out).not.toContain("NAUTIX-GUARD");
  });
});
