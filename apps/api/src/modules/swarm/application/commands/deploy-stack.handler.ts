import type { ComposeRunResult } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { StackRunner } from "../ports/stack-runner.js";
import { DeployStackCommand } from "./deploy-stack.command.js";

@CommandHandler(DeployStackCommand)
export class DeployStackHandler implements ICommandHandler<DeployStackCommand, ComposeRunResult> {
  constructor(@Inject(StackRunner) private readonly runner: StackRunner) {}

  execute(c: DeployStackCommand): Promise<ComposeRunResult> {
    return this.runner.deploy(c.name, c.yaml);
  }
}
