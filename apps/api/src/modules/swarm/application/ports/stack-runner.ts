import type { ComposeRunResult } from "@nautix/contracts";

/** Port: `docker stack deploy|rm` (a CLI-only feature). */
export abstract class StackRunner {
  abstract deploy(name: string, yaml: string): Promise<ComposeRunResult>;
  abstract remove(name: string): Promise<ComposeRunResult>;
}
