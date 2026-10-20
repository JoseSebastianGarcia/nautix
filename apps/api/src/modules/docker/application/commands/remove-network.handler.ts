import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { DockerEngine } from "../ports/docker-engine.js";
import { RemoveNetworkCommand } from "./remove-network.command.js";

@CommandHandler(RemoveNetworkCommand)
export class RemoveNetworkHandler implements ICommandHandler<RemoveNetworkCommand, void> {
  constructor(@Inject(DockerEngine) private readonly engine: DockerEngine) {}

  execute(c: RemoveNetworkCommand): Promise<void> {
    return this.engine.removeNetwork(c.id);
  }
}
