import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { DockerEngine } from "../ports/docker-engine.js";
import { SelfGuard } from "../self-guard.js";
import { RemoveContainerCommand } from "./remove-container.command.js";

@CommandHandler(RemoveContainerCommand)
export class RemoveContainerHandler implements ICommandHandler<RemoveContainerCommand, void> {
  constructor(
    @Inject(DockerEngine) private readonly engine: DockerEngine,
    @Inject(SelfGuard) private readonly guard: SelfGuard,
  ) {}

  async execute(c: RemoveContainerCommand): Promise<void> {
    await this.guard.assertNotSelf(c.id);
    await this.engine.removeContainer(c.id, c.force);
  }
}
