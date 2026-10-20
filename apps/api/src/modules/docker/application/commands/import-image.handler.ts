import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { DockerEngine } from "../ports/docker-engine.js";
import { ImportImageCommand } from "./import-image.command.js";

@CommandHandler(ImportImageCommand)
export class ImportImageHandler implements ICommandHandler<ImportImageCommand, string> {
  constructor(@Inject(DockerEngine) private readonly engine: DockerEngine) {}

  execute(q: ImportImageCommand): Promise<string> {
    return this.engine.importImage(q.tar, q.repository, q.tag);
  }
}
