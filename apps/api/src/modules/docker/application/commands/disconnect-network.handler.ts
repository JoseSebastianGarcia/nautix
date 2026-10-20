import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { DockerEngine } from "../ports/docker-engine.js";
import { SelfGuard } from "../self-guard.js";
import { DisconnectNetworkCommand } from "./disconnect-network.command.js";

@CommandHandler(DisconnectNetworkCommand)
export class DisconnectNetworkHandler implements ICommandHandler<DisconnectNetworkCommand, void> {
  constructor(
    @Inject(DockerEngine) private readonly engine: DockerEngine,
    @Inject(SelfGuard) private readonly guard: SelfGuard,
  ) {}

  async execute(c: DisconnectNetworkCommand): Promise<void> {
    await this.guard.assertNotSelf(c.containerId);
    await this.engine.disconnectNetwork(c.networkId, c.containerId);
  }
}
