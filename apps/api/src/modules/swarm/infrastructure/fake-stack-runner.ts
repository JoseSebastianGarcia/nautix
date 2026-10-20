import type { ComposeRunResult } from "@nautix/contracts";
import { StackRunner } from "../application/ports/stack-runner.js";

/** Demo/test runner: nothing is executed. */
export class FakeStackRunner extends StackRunner {
  async deploy(name: string): Promise<ComposeRunResult> {
    return {
      ok: true,
      exitCode: 0,
      output: `[demo] docker stack deploy ${name} was not executed.\n`,
    };
  }
  async remove(name: string): Promise<ComposeRunResult> {
    return { ok: true, exitCode: 0, output: `[demo] docker stack rm ${name} was not executed.\n` };
  }
}
