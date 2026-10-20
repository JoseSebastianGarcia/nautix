import type { UpdateSwarmService } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { SwarmEngine } from "../ports/swarm-engine.js";
import { UpdateSwarmServiceSpecCommand } from "./update-swarm-service-spec.command.js";

@CommandHandler(UpdateSwarmServiceSpecCommand)
export class UpdateSwarmServiceSpecHandler
  implements ICommandHandler<UpdateSwarmServiceSpecCommand, void>
{
  constructor(@Inject(SwarmEngine) private readonly engine: SwarmEngine) {}

  execute(c: UpdateSwarmServiceSpecCommand): Promise<void> {
    return this.engine.updateService(c.id, c.patch);
  }
}
