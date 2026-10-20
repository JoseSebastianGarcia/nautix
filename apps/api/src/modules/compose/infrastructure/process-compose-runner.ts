import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { ComposeRunResult } from "@nautix/contracts";
import { type ComposeRun, ComposeRunner } from "../application/ports/compose-runner.js";

const MAX_OUTPUT = 512 * 1024;

export interface ProcessComposeOptions {
  dockerBin: string;
  dataDir: string;
  socketPath: string;
  timeoutMs: number;
}

/**
 * Runs `docker compose -f - …` with the file on stdin. Arguments are an array (no shell);
 * the project name is validated upstream. Only a minimal environment is passed on.
 * Relative bind mounts can't work (the daemon resolves paths on the host), the editor warns about them.
 */
export class ProcessComposeRunner extends ComposeRunner {
  constructor(private readonly options: ProcessComposeOptions) {
    super();
  }

  run({ project, content, action, removeVolumes }: ComposeRun): Promise<ComposeRunResult> {
    const extra: Record<ComposeRun["action"], string[]> = {
      up: ["up", "-d", "--remove-orphans"],
      down: ["down", "--remove-orphans", ...(removeVolumes ? ["--volumes"] : [])],
      pull: ["pull"],
      config: ["config"],
    };
    const cwd = join(this.options.dataDir, "projects", project);
    mkdirSync(cwd, { recursive: true });

    return new Promise((resolve) => {
      let output = "";
      let truncated = false;
      const append = (chunk: Buffer) => {
        if (output.length >= MAX_OUTPUT) {
          truncated = true;
          return;
        }
        output += chunk.toString("utf8");
      };
      const child = spawn(
        this.options.dockerBin,
        [
          "compose",
          "--ansi",
          "never",
          "--progress",
          "plain",
          "--project-name",
          project,
          "-f",
          "-",
          ...extra[action],
        ],
        {
          cwd,
          env: {
            PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
            HOME: cwd,
            DOCKER_HOST: `unix://${this.options.socketPath}`,
          },
          stdio: ["pipe", "pipe", "pipe"],
        },
      );
      const timer = setTimeout(() => {
        output += "\n[nautix] timed out, stopping the process\n";
        child.kill("SIGKILL");
      }, this.options.timeoutMs);

      child.stdout.on("data", append);
      child.stderr.on("data", append);
      child.on("error", (error) => {
        clearTimeout(timer);
        resolve({
          ok: false,
          exitCode: null,
          output: `${output}\n[nautix] could not start docker: ${error.message}\n`,
        });
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({
          ok: code === 0,
          exitCode: code,
          output: truncated ? `${output}\n[nautix] output truncated\n` : output,
        });
      });
      child.stdin.on("error", () => undefined);
      child.stdin.end(content);
    });
  }
}
