import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { DockerEngine } from "../ports/docker-engine.js";
import { CreateNetworkCommand } from "./create-network.command.js";

@CommandHandler(CreateNetworkCommand)
export class CreateNetworkHandler implements ICommandHandler<CreateNetworkCommand, { id: string }> {
  constructor(@Inject(DockerEngine) private readonly engine: DockerEngine) {}

  execute(c: CreateNetworkCommand): Promise<{ id: string }> {
    return this.engine.createNetwork(c.request);
  }
}
