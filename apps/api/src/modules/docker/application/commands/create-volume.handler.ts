import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { DockerEngine } from "../ports/docker-engine.js";
import { CreateVolumeCommand } from "./create-volume.command.js";

@CommandHandler(CreateVolumeCommand)
export class CreateVolumeHandler implements ICommandHandler<CreateVolumeCommand, void> {
  constructor(@Inject(DockerEngine) private readonly engine: DockerEngine) {}

  execute(c: CreateVolumeCommand): Promise<void> {
    return this.engine.createVolume(c.name);
  }
}
