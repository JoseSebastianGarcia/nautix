import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { SwarmEngine } from "../ports/swarm-engine.js";
import { RemoveSwarmConfigCommand } from "./remove-swarm-config.command.js";

@CommandHandler(RemoveSwarmConfigCommand)
export class RemoveSwarmConfigHandler implements ICommandHandler<RemoveSwarmConfigCommand, void> {
  constructor(@Inject(SwarmEngine) private readonly engine: SwarmEngine) {}

  execute(c: RemoveSwarmConfigCommand): Promise<void> {
    return this.engine.removeConfig(c.id);
  }
}
