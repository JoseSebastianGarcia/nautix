import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { DockerEngine } from "../ports/docker-engine.js";
import { SelfGuard } from "../self-guard.js";
import { RenameContainerCommand } from "./rename-container.command.js";

@CommandHandler(RenameContainerCommand)
export class RenameContainerHandler implements ICommandHandler<RenameContainerCommand, void> {
  constructor(
    @Inject(DockerEngine) private readonly engine: DockerEngine,
    @Inject(SelfGuard) private readonly guard: SelfGuard,
  ) {}

  async execute(q: RenameContainerCommand): Promise<void> {
    await this.guard.assertNotSelf(q.id);
    return this.engine.renameContainer(q.id, q.name);
  }
}
