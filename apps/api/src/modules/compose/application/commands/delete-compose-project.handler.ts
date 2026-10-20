import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { ComposeProjectRepository } from "../ports/compose-project-repository.js";
import { DeleteComposeProjectCommand } from "./delete-compose-project.command.js";

/** Deletes the saved file only; containers it started keep running until `down`. */
@CommandHandler(DeleteComposeProjectCommand)
export class DeleteComposeProjectHandler
  implements ICommandHandler<DeleteComposeProjectCommand, void>
{
  constructor(
    @Inject(ComposeProjectRepository) private readonly projects: ComposeProjectRepository,
  ) {}

  execute({ name }: DeleteComposeProjectCommand): Promise<void> {
    return this.projects.remove(name);
  }
}
