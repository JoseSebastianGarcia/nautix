import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { SwarmEngine } from "../ports/swarm-engine.js";
import { LeaveSwarmCommand } from "./leave-swarm.command.js";

@CommandHandler(LeaveSwarmCommand)
export class LeaveSwarmHandler implements ICommandHandler<LeaveSwarmCommand, void> {
  constructor(@Inject(SwarmEngine) private readonly engine: SwarmEngine) {}

  execute(c: LeaveSwarmCommand): Promise<void> {
    return this.engine.leave(c.force);
  }
}
