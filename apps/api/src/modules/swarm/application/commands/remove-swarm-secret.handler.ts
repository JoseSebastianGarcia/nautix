import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { SwarmEngine } from "../ports/swarm-engine.js";
import { RemoveSwarmSecretCommand } from "./remove-swarm-secret.command.js";

@CommandHandler(RemoveSwarmSecretCommand)
export class RemoveSwarmSecretHandler implements ICommandHandler<RemoveSwarmSecretCommand, void> {
  constructor(@Inject(SwarmEngine) private readonly engine: SwarmEngine) {}

  execute(c: RemoveSwarmSecretCommand): Promise<void> {
    return this.engine.removeSecret(c.id);
  }
}
