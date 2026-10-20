import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { SwarmEngine } from "../ports/swarm-engine.js";
import { UnlockSwarmCommand } from "./unlock-swarm.command.js";

@CommandHandler(UnlockSwarmCommand)
export class UnlockSwarmHandler implements ICommandHandler<UnlockSwarmCommand, void> {
  constructor(@Inject(SwarmEngine) private readonly engine: SwarmEngine) {}

  execute(c: UnlockSwarmCommand): Promise<void> {
    return this.engine.unlock(c.key);
  }
}
