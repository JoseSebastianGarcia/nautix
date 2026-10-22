import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { ConflictError } from "../../../../shared/domain-error.js";
import { overlayBlocker } from "../../domain/overlay-gate.js";
import { DockerEngine } from "../ports/docker-engine.js";
import { CreateNetworkCommand } from "./create-network.command.js";

@CommandHandler(CreateNetworkCommand)
export class CreateNetworkHandler implements ICommandHandler<CreateNetworkCommand, { id: string }> {
  constructor(@Inject(DockerEngine) private readonly engine: DockerEngine) {}

  async execute(c: CreateNetworkCommand): Promise<{ id: string }> {
    // Docker refuses an overlay network outside a manager with a cryptic error: say it first, and why.
    if (c.request.driver === "overlay") {
      const hint = overlayBlocker(await this.engine.swarmRole());
      if (hint) throw new ConflictError("an overlay network needs a swarm manager", hint);
    }
    return this.engine.createNetwork(c.request);
  }
}
