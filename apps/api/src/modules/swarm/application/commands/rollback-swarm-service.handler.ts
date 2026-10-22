import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { SwarmEngine } from "../ports/swarm-engine.js";
import { RollbackSwarmServiceCommand } from "./rollback-swarm-service.command.js";

@CommandHandler(RollbackSwarmServiceCommand)
export class RollbackSwarmServiceHandler
  implements ICommandHandler<RollbackSwarmServiceCommand, void>
{
  constructor(@Inject(SwarmEngine) private readonly engine: SwarmEngine) {}

  execute(c: RollbackSwarmServiceCommand): Promise<void> {
    return this.engine.rollbackService(c.id);
  }
}
