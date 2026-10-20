import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { SwarmEngine } from "../ports/swarm-engine.js";
import { CreateSwarmConfigValueCommand } from "./create-swarm-config-value.command.js";

@CommandHandler(CreateSwarmConfigValueCommand)
export class CreateSwarmConfigValueHandler
  implements ICommandHandler<CreateSwarmConfigValueCommand, void>
{
  constructor(@Inject(SwarmEngine) private readonly engine: SwarmEngine) {}

  execute(c: CreateSwarmConfigValueCommand): Promise<void> {
    return this.engine.createConfig(c.name, c.value);
  }
}
