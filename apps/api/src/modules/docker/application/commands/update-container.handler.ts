import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { DockerEngine } from "../ports/docker-engine.js";
import { SelfGuard } from "../self-guard.js";
import { UpdateContainerCommand } from "./update-container.command.js";

@CommandHandler(UpdateContainerCommand)
export class UpdateContainerHandler implements ICommandHandler<UpdateContainerCommand, void> {
  constructor(
    @Inject(DockerEngine) private readonly engine: DockerEngine,
    @Inject(SelfGuard) private readonly guard: SelfGuard,
  ) {}

  async execute(q: UpdateContainerCommand): Promise<void> {
    await this.guard.assertNotSelf(q.id);
    return this.engine.updateContainer(q.id, q.update);
  }
}
