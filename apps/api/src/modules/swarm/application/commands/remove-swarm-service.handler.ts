import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { SwarmEngine } from "../ports/swarm-engine.js";
import { RemoveSwarmServiceCommand } from "./remove-swarm-service.command.js";

@CommandHandler(RemoveSwarmServiceCommand)
export class RemoveSwarmServiceHandler implements ICommandHandler<RemoveSwarmServiceCommand, void> {
  constructor(@Inject(SwarmEngine) private readonly engine: SwarmEngine) {}

  execute(c: RemoveSwarmServiceCommand): Promise<void> {
    return this.engine.removeService(c.id);
  }
}
