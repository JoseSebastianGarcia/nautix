import type { ComposeRunResult } from "@nautix/contracts";
import { type ComposeRun, ComposeRunner } from "../application/ports/compose-runner.js";

/** Demo/test runner: nothing is executed. */
export class FakeComposeRunner extends ComposeRunner {
  readonly runs: ComposeRun[] = [];

  async run(run: ComposeRun): Promise<ComposeRunResult> {
    this.runs.push(run);
    return {
      ok: true,
      exitCode: 0,
      output: `[demo] docker compose ${run.action} for project "${run.project}" was not executed (demo engine).\n`,
    };
  }
}
