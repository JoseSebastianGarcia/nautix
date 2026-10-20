import type { CreateSwarmService } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { SwarmEngine } from "../ports/swarm-engine.js";
import { CreateSwarmServiceSpecCommand } from "./create-swarm-service-spec.command.js";

@CommandHandler(CreateSwarmServiceSpecCommand)
export class CreateSwarmServiceSpecHandler
  implements ICommandHandler<CreateSwarmServiceSpecCommand, { id: string }>
{
  constructor(@Inject(SwarmEngine) private readonly engine: SwarmEngine) {}

  execute(c: CreateSwarmServiceSpecCommand): Promise<{ id: string }> {
    return this.engine.createService(c.request);
  }
}
