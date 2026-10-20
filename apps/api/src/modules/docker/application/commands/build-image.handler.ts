import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { buildTar } from "../../domain/tar.js";
import { DockerEngine } from "../ports/docker-engine.js";
import { BuildImageCommand } from "./build-image.command.js";

/** Returns the builder output as a stream; the controller forwards it line by line. */
@CommandHandler(BuildImageCommand)
export class BuildImageHandler
  implements ICommandHandler<BuildImageCommand, AsyncIterable<string>>
{
  constructor(@Inject(DockerEngine) private readonly engine: DockerEngine) {}

  async execute({ request }: BuildImageCommand): Promise<AsyncIterable<string>> {
    const context = buildTar([
      { path: "Dockerfile", content: request.dockerfile },
      ...request.files
        .filter((f) => f.path !== "Dockerfile")
        .map((f) => ({ path: f.path, content: f.content })),
    ]);
    return this.engine.buildImage(context, {
      tag: request.tag,
      buildArgs: request.buildArgs,
      noCache: request.noCache,
      pull: request.pull,
      ...(request.target ? { target: request.target } : {}),
    });
  }
}
