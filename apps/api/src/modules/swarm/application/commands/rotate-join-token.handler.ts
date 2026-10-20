import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { SwarmEngine } from "../ports/swarm-engine.js";
import { RotateJoinTokenCommand } from "./rotate-join-token.command.js";

@CommandHandler(RotateJoinTokenCommand)
export class RotateJoinTokenHandler implements ICommandHandler<RotateJoinTokenCommand, void> {
  constructor(@Inject(SwarmEngine) private readonly engine: SwarmEngine) {}

  execute(c: RotateJoinTokenCommand): Promise<void> {
    return this.engine.rotateToken(c.target);
  }
}
