import type { ComposeRunResult } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { StackRunner } from "../ports/stack-runner.js";
import { RemoveStackCommand } from "./remove-stack.command.js";

@CommandHandler(RemoveStackCommand)
export class RemoveStackHandler implements ICommandHandler<RemoveStackCommand, ComposeRunResult> {
  constructor(@Inject(StackRunner) private readonly runner: StackRunner) {}

  execute(c: RemoveStackCommand): Promise<ComposeRunResult> {
    return this.runner.remove(c.name);
  }
}
