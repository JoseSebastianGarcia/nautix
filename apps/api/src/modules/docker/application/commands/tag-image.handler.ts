import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { DockerEngine } from "../ports/docker-engine.js";
import { TagImageCommand } from "./tag-image.command.js";

@CommandHandler(TagImageCommand)
export class TagImageHandler implements ICommandHandler<TagImageCommand, void> {
  constructor(@Inject(DockerEngine) private readonly engine: DockerEngine) {}

  execute(q: TagImageCommand): Promise<void> {
    return this.engine.imageTag(q.ref, q.repository, q.tag);
  }
}
