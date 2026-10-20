import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { DockerEngine } from "../ports/docker-engine.js";
import { RemoveImageCommand } from "./remove-image.command.js";

@CommandHandler(RemoveImageCommand)
export class RemoveImageHandler implements ICommandHandler<RemoveImageCommand, void> {
  constructor(@Inject(DockerEngine) private readonly engine: DockerEngine) {}

  execute(c: RemoveImageCommand): Promise<void> {
    return this.engine.removeImage(c.id, c.force);
  }
}
