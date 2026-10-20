import type { ComposeAction, ComposeRunResult } from "@nautix/contracts";

export interface ComposeRun {
  project: string;
  content: string;
  action: ComposeAction;
  removeVolumes: boolean;
}

/** Port: runs `docker compose` for one project. Adapters: process (real), fake (demo/tests). */
export abstract class ComposeRunner {
  abstract run(run: ComposeRun): Promise<ComposeRunResult>;
}
