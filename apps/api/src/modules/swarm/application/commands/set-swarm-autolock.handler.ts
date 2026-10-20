import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { SwarmEngine } from "../ports/swarm-engine.js";
import { SetSwarmAutolockCommand } from "./set-swarm-autolock.command.js";

@CommandHandler(SetSwarmAutolockCommand)
export class SetSwarmAutolockHandler implements ICommandHandler<SetSwarmAutolockCommand, void> {
  constructor(@Inject(SwarmEngine) private readonly engine: SwarmEngine) {}

  execute(c: SetSwarmAutolockCommand): Promise<void> {
    return this.engine.setAutolock(c.enabled);
  }
}
