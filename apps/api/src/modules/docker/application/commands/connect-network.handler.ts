import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { DockerEngine } from "../ports/docker-engine.js";
import { SelfGuard } from "../self-guard.js";
import { ConnectNetworkCommand } from "./connect-network.command.js";

@CommandHandler(ConnectNetworkCommand)
export class ConnectNetworkHandler implements ICommandHandler<ConnectNetworkCommand, void> {
  constructor(
    @Inject(DockerEngine) private readonly engine: DockerEngine,
    @Inject(SelfGuard) private readonly guard: SelfGuard,
  ) {}

  async execute(c: ConnectNetworkCommand): Promise<void> {
    await this.guard.assertNotSelf(c.containerId);
    await this.engine.connectNetwork(c.networkId, c.containerId);
  }
}
