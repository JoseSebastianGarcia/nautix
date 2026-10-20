import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { DockerEngine } from "../ports/docker-engine.js";
import { LoadImageCommand } from "./load-image.command.js";

@CommandHandler(LoadImageCommand)
export class LoadImageHandler implements ICommandHandler<LoadImageCommand, string> {
  constructor(@Inject(DockerEngine) private readonly engine: DockerEngine) {}

  execute(q: LoadImageCommand): Promise<string> {
    return this.engine.loadImages(q.tar);
  }
}
