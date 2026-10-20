import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { SwarmEngine } from "../ports/swarm-engine.js";
import { InitSwarmCommand } from "./init-swarm.command.js";

@CommandHandler(InitSwarmCommand)
export class InitSwarmHandler implements ICommandHandler<InitSwarmCommand, string> {
  constructor(@Inject(SwarmEngine) private readonly engine: SwarmEngine) {}

  execute(c: InitSwarmCommand): Promise<string> {
    return this.engine.init(c.advertiseAddr);
  }
}
