import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import {
  GUARD_BACKENDS,
  type GuardBackend,
  type GuardPlanDoc,
  type GuardReport,
} from "@nautix/contracts";
import {
  detectBackend,
  type Executor,
  GuardHelper,
} from "./modules/guard/infrastructure/helper-runner.js";

/**
 * Port guards helper: `node dist/guard-helper.js`, run as root with `--network host --cap-add NET_ADMIN`.
 * It holds no data and exposes no port; it polls Nautix and applies the firewall rules it is given.
 *   NAUTIX_URL            where Nautix listens (default http://127.0.0.1:3737)
 *   NAUTIX_GUARD_TOKEN    the token shown once in Nautix → Resources → Guards
 *   NAUTIX_GUARD_INSECURE 1 to accept Nautix's self-signed certificate (loopback only)
 *   --backend iptables|nftables   (default: detect)   --interval seconds (default 5)   --panic
 */
const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const base = new URL(process.env.NAUTIX_URL ?? "http://127.0.0.1:3737");
const token = process.env.NAUTIX_GUARD_TOKEN ?? "";
const insecure = process.env.NAUTIX_GUARD_INSECURE === "1";

const exec: Executor = {
  write: async (path, content) => writeFile(path, content, { mode: 0o600 }),
  run: (argv, stdin) =>
    new Promise((resolve) => {
      const [bin, ...rest] = argv;
      if (!bin) return resolve({ code: 1, output: "empty command" });
      const child = spawn(bin, rest, { stdio: ["pipe", "pipe", "pipe"] });
      let output = "";
      child.stdout.on("data", (c: Buffer) => {
        output += c.toString("utf8");
      });
      child.stderr.on("data", (c: Buffer) => {
        output += c.toString("utf8");
      });
      child.on("error", (e) => resolve({ code: 127, output: e.message }));
      child.on("close", (code) => resolve({ code: code ?? 1, output }));
      child.stdin.on("error", () => undefined);
      child.stdin.end(stdin ?? "");
    }),
};

const call = (method: "GET" | "POST", path: string, body?: unknown): Promise<string> =>
  new Promise((resolve, reject) => {
    const send = base.protocol === "https:" ? httpsRequest : httpRequest;
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = send(
      {
        host: base.hostname,
        port: base.port || (base.protocol === "https:" ? 443 : 80),
        path,
        method,
        headers: {
          authorization: `Bearer ${token}`,
          ...(payload
            ? { "content-type": "application/json", "content-length": Buffer.byteLength(payload) }
            : {}),
        },
        ...(base.protocol === "https:" ? { rejectUnauthorized: !insecure } : {}),
        timeout: 8000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          if ((res.statusCode ?? 500) >= 300)
            reject(new Error(`HTTP ${res.statusCode}: ${text.slice(0, 200)}`));
          else resolve(text);
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.end(payload);
  });

const main = async (): Promise<void> => {
  const requested = flag("backend");
  const backend: GuardBackend | null =
    requested && (GUARD_BACKENDS as readonly string[]).includes(requested)
      ? (requested as GuardBackend)
      : await detectBackend(exec);
  if (!backend) {
    console.error("guard: neither iptables nor nft is available in this container");
    process.exit(1);
  }
  const helper = new GuardHelper(backend, {
    exec,
    now: Date.now,
    fetchPlan: async () =>
      JSON.parse(await call("GET", "/api/v1/guard/helper/plan")) as GuardPlanDoc,
    report: async (report: GuardReport) => {
      await call("POST", "/api/v1/guard/helper/report", report);
    },
  });

  if (args.includes("--panic")) {
    const result = await helper.removeAll();
    console.log(result.ok ? "guard: Nautix rules removed" : `guard: ${result.error}`);
    process.exit(result.ok ? 0 : 1);
  }
  if (!token) {
    console.error("guard: set NAUTIX_GUARD_TOKEN (create it in Nautix → Resources → Guards)");
    process.exit(1);
  }
  const every = Math.max(2, Number(flag("interval") ?? "5")) * 1000;
  console.log(`guard: using ${backend}, polling ${base.origin} every ${every / 1000}s`);
  for (;;) {
    await helper.tick().catch((e: unknown) => console.error("guard:", e));
    await new Promise((r) => setTimeout(r, every));
  }
};

void main();
