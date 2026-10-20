import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { DockerEngine } from "../ports/docker-engine.js";
import { RemoveVolumeCommand } from "./remove-volume.command.js";

@CommandHandler(RemoveVolumeCommand)
export class RemoveVolumeHandler implements ICommandHandler<RemoveVolumeCommand, void> {
  constructor(@Inject(DockerEngine) private readonly engine: DockerEngine) {}

  execute(c: RemoveVolumeCommand): Promise<void> {
    return this.engine.removeVolume(c.name);
  }
}
