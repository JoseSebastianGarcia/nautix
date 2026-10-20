import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { SwarmEngine } from "../ports/swarm-engine.js";
import { CreateSwarmSecretValueCommand } from "./create-swarm-secret-value.command.js";

@CommandHandler(CreateSwarmSecretValueCommand)
export class CreateSwarmSecretValueHandler
  implements ICommandHandler<CreateSwarmSecretValueCommand, void>
{
  constructor(@Inject(SwarmEngine) private readonly engine: SwarmEngine) {}

  execute(c: CreateSwarmSecretValueCommand): Promise<void> {
    return this.engine.createSecret(c.name, c.value);
  }
}
