import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { DockerEngine } from "../ports/docker-engine.js";
import { DisconnectNetworkCommand } from "./disconnect-network.command.js";

@CommandHandler(DisconnectNetworkCommand)
export class DisconnectNetworkHandler implements ICommandHandler<DisconnectNetworkCommand, void> {
  constructor(@Inject(DockerEngine) private readonly engine: DockerEngine) {}

  execute(c: DisconnectNetworkCommand): Promise<void> {
    return this.engine.disconnectNetwork(c.networkId, c.containerId);
  }
}
