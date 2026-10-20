import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { DockerEngine } from "../ports/docker-engine.js";
import { RemoveContainerCommand } from "./remove-container.command.js";

@CommandHandler(RemoveContainerCommand)
export class RemoveContainerHandler implements ICommandHandler<RemoveContainerCommand, void> {
  constructor(@Inject(DockerEngine) private readonly engine: DockerEngine) {}

  execute(c: RemoveContainerCommand): Promise<void> {
    return this.engine.removeContainer(c.id, c.force);
  }
}
