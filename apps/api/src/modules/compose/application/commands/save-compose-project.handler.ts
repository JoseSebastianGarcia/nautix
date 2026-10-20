import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { ComposeProjectRepository } from "../ports/compose-project-repository.js";
import { SaveComposeProjectCommand } from "./save-compose-project.command.js";

/** Drafts are saved as-is, even with errors; validation gates `up`, not saving. */
@CommandHandler(SaveComposeProjectCommand)
export class SaveComposeProjectHandler implements ICommandHandler<SaveComposeProjectCommand, void> {
  constructor(
    @Inject(ComposeProjectRepository) private readonly projects: ComposeProjectRepository,
  ) {}

  execute({ name, content }: SaveComposeProjectCommand): Promise<void> {
    return this.projects.save(name, content, Date.now());
  }
}
