import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { DockerEngine } from "../ports/docker-engine.js";
import { PullImageCommand } from "./pull-image.command.js";

@CommandHandler(PullImageCommand)
export class PullImageHandler implements ICommandHandler<PullImageCommand, void> {
  constructor(@Inject(DockerEngine) private readonly engine: DockerEngine) {}

  execute(c: PullImageCommand): Promise<void> {
    return this.engine.pullImage(c.reference);
  }
}
