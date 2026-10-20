import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { SwarmEngine } from "../ports/swarm-engine.js";
import { RemoveSwarmNodeCommand } from "./remove-swarm-node.command.js";

@CommandHandler(RemoveSwarmNodeCommand)
export class RemoveSwarmNodeHandler implements ICommandHandler<RemoveSwarmNodeCommand, void> {
  constructor(@Inject(SwarmEngine) private readonly engine: SwarmEngine) {}

  execute(c: RemoveSwarmNodeCommand): Promise<void> {
    return this.engine.removeNode(c.id, c.force);
  }
}
