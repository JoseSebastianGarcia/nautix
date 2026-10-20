import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { SwarmEngine } from "../ports/swarm-engine.js";
import { JoinSwarmCommand } from "./join-swarm.command.js";

@CommandHandler(JoinSwarmCommand)
export class JoinSwarmHandler implements ICommandHandler<JoinSwarmCommand, void> {
  constructor(@Inject(SwarmEngine) private readonly engine: SwarmEngine) {}

  execute(c: JoinSwarmCommand): Promise<void> {
    return this.engine.join(c.remoteAddr, c.token, c.advertiseAddr);
  }
}
