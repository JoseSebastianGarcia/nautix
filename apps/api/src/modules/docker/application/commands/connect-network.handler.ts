import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { DockerEngine } from "../ports/docker-engine.js";
import { ConnectNetworkCommand } from "./connect-network.command.js";

@CommandHandler(ConnectNetworkCommand)
export class ConnectNetworkHandler implements ICommandHandler<ConnectNetworkCommand, void> {
  constructor(@Inject(DockerEngine) private readonly engine: DockerEngine) {}

  execute(c: ConnectNetworkCommand): Promise<void> {
    return this.engine.connectNetwork(c.networkId, c.containerId);
  }
}
