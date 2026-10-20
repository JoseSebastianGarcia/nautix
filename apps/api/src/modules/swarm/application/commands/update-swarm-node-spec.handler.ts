import type { UpdateSwarmNode } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { SwarmEngine } from "../ports/swarm-engine.js";
import { UpdateSwarmNodeSpecCommand } from "./update-swarm-node-spec.command.js";

@CommandHandler(UpdateSwarmNodeSpecCommand)
export class UpdateSwarmNodeSpecHandler
  implements ICommandHandler<UpdateSwarmNodeSpecCommand, void>
{
  constructor(@Inject(SwarmEngine) private readonly engine: SwarmEngine) {}

  execute(c: UpdateSwarmNodeSpecCommand): Promise<void> {
    return this.engine.updateNode(c.id, c.patch);
  }
}
