import { hasRisks, parse, validateCompose } from "@nautix/compose";
import type { ComposeRunResult } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { ConflictError } from "../../../../shared/domain-error.js";
import { StackRunner } from "../ports/stack-runner.js";
import { DeployStackCommand } from "./deploy-stack.command.js";

@CommandHandler(DeployStackCommand)
export class DeployStackHandler implements ICommandHandler<DeployStackCommand, ComposeRunResult> {
  constructor(@Inject(StackRunner) private readonly runner: StackRunner) {}

  execute(c: DeployStackCommand): Promise<ComposeRunResult> {
    // Same rule as Compose `up`: host mounts and privileged features need an explicit yes (ADR-063).
    if (hasRisks(validateCompose(parse(c.yaml))) && !c.acknowledgeRisks)
      throw new ConflictError(
        "the file uses privileged features; acknowledge the risks to continue",
        "errors.composeRisk",
      );
    return this.runner.deploy(c.name, c.yaml);
  }
}
