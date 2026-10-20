import type { PruneResult } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { DockerEngine } from "../ports/docker-engine.js";
import { PruneResourcesCommand } from "./prune-resources.command.js";

@CommandHandler(PruneResourcesCommand)
export class PruneResourcesHandler implements ICommandHandler<PruneResourcesCommand, PruneResult> {
  constructor(@Inject(DockerEngine) private readonly engine: DockerEngine) {}

  execute(q: PruneResourcesCommand): Promise<PruneResult> {
    return this.engine.prune(q.kind, q.all);
  }
}
