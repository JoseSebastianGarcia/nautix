import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { DockerEngine } from "../ports/docker-engine.js";
import { PushImageCommand } from "./push-image.command.js";

@CommandHandler(PushImageCommand)
export class PushImageHandler implements ICommandHandler<PushImageCommand, string> {
  constructor(@Inject(DockerEngine) private readonly engine: DockerEngine) {}

  execute(q: PushImageCommand): Promise<string> {
    return this.engine.pushImage(q.reference, q.auth);
  }
}
