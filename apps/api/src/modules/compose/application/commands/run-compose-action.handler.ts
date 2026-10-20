import { hasRisks, parse, validateCompose } from "@nautix/compose";
import type { ComposeRunResult } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { ConflictError, NotFoundError, ValidationError } from "../../../../shared/domain-error.js";
import { ComposeProjectRepository } from "../ports/compose-project-repository.js";
import { ComposeRunner } from "../ports/compose-runner.js";
import { RunComposeActionCommand } from "./run-compose-action.command.js";

@CommandHandler(RunComposeActionCommand)
export class RunComposeActionHandler
  implements ICommandHandler<RunComposeActionCommand, ComposeRunResult>
{
  /** One operation per project at a time. */
  private readonly busy = new Set<string>();

  constructor(
    @Inject(ComposeProjectRepository) private readonly projects: ComposeProjectRepository,
    @Inject(ComposeRunner) private readonly runner: ComposeRunner,
  ) {}

  async execute(cmd: RunComposeActionCommand): Promise<ComposeRunResult> {
    const project = await this.projects.get(cmd.name);
    if (!project) throw new NotFoundError("project not found", "errors.notFound");

    // Pulling or inspecting a broken file is pointless; `down` must work even if the file drifted.
    if (cmd.action !== "down") {
      const issues = validateCompose(parse(project.content));
      const errors = issues.filter((i) => i.level === "error");
      if (errors.length > 0) {
        throw new ValidationError(
          `compose file has errors: ${errors.map((e) => e.code).join(", ")}`,
          "errors.composeInvalid",
        );
      }
      if (cmd.action === "up" && hasRisks(issues) && !cmd.acknowledgeRisks) {
        throw new ConflictError(
          "the file uses privileged features; acknowledge the risks to continue",
          "errors.composeRisk",
        );
      }
    }

    if (this.busy.has(cmd.name))
      throw new ConflictError("another operation is running", "errors.composeBusy");
    this.busy.add(cmd.name);
    try {
      return await this.runner.run({
        project: cmd.name,
        content: project.content,
        action: cmd.action,
        removeVolumes: cmd.removeVolumes,
      });
    } finally {
      this.busy.delete(cmd.name);
    }
  }
}
