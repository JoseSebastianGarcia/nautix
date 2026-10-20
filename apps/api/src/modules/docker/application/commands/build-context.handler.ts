import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { DockerEngine } from "../ports/docker-engine.js";
import { BuildContextCommand } from "./build-context.command.js";

@CommandHandler(BuildContextCommand)
export class BuildContextHandler
  implements ICommandHandler<BuildContextCommand, AsyncIterable<string>>
{
  constructor(@Inject(DockerEngine) private readonly engine: DockerEngine) {}

  async execute({ context, options }: BuildContextCommand): Promise<AsyncIterable<string>> {
    return this.engine.buildImage(context, {
      tag: options.tag,
      buildArgs: options.buildArgs,
      noCache: options.noCache,
      pull: options.pull,
      dockerfile: options.dockerfilePath,
      ...(options.target ? { target: options.target } : {}),
    });
  }
}
