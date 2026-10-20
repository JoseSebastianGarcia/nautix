import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { DockerEngine } from "../ports/docker-engine.js";
import { SelfGuard } from "../self-guard.js";
import { CommitContainerCommand } from "./commit-container.command.js";

@CommandHandler(CommitContainerCommand)
export class CommitContainerHandler
  implements ICommandHandler<CommitContainerCommand, { id: string }>
{
  constructor(
    @Inject(DockerEngine) private readonly engine: DockerEngine,
    @Inject(SelfGuard) private readonly guard: SelfGuard,
  ) {}

  async execute(q: CommitContainerCommand): Promise<{ id: string }> {
    await this.guard.assertNotSelf(q.id);
    return this.engine.commitContainer(q.id, q.input);
  }
}
