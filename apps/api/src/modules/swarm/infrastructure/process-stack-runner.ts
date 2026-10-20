import { spawn } from "node:child_process";
import type { ComposeRunResult } from "@nautix/contracts";
import { StackRunner } from "../application/ports/stack-runner.js";

const MAX_OUTPUT = 512 * 1024;

export interface ProcessStackOptions {
  dockerBin: string;
  socketPath: string;
  timeoutMs: number;
}

/** Runs `docker stack deploy|rm` with an argument array, the file on stdin and a minimal environment. */
export class ProcessStackRunner extends StackRunner {
  constructor(private readonly options: ProcessStackOptions) {
    super();
  }

  deploy(name: string, yaml: string): Promise<ComposeRunResult> {
    return this.run(["stack", "deploy", "--compose-file", "-", name], yaml);
  }

  remove(name: string): Promise<ComposeRunResult> {
    return this.run(["stack", "rm", name]);
  }

  private run(args: string[], stdin?: string): Promise<ComposeRunResult> {
    return new Promise((resolve) => {
      let output = "";
      const append = (chunk: Buffer) => {
        if (output.length < MAX_OUTPUT) output += chunk.toString("utf8");
      };
      const child = spawn(this.options.dockerBin, args, {
        env: {
          PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
          DOCKER_HOST: `unix://${this.options.socketPath}`,
        },
        stdio: ["pipe", "pipe", "pipe"],
      });
      const timer = setTimeout(() => child.kill("SIGKILL"), this.options.timeoutMs);
      child.stdout.on("data", append);
      child.stderr.on("data", append);
      child.on("error", (e) => {
        clearTimeout(timer);
        resolve({ ok: false, exitCode: null, output: `could not start docker: ${e.message}` });
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({ ok: code === 0, exitCode: code, output });
      });
      if (stdin !== undefined) child.stdin.write(stdin);
      child.stdin.end();
    });
  }
}
