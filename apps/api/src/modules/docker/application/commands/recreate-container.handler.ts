import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { NotFoundError } from "../../../../shared/domain-error.js";
import { DockerEngine } from "../ports/docker-engine.js";
import { SelfGuard } from "../self-guard.js";
import { RecreateContainerCommand } from "./recreate-container.command.js";

@CommandHandler(RecreateContainerCommand)
export class RecreateContainerHandler implements ICommandHandler<RecreateContainerCommand, void> {
  constructor(
    @Inject(DockerEngine) private readonly engine: DockerEngine,
    @Inject(SelfGuard) private readonly guard: SelfGuard,
  ) {}

  async execute({ containerId, change, gate }: RecreateContainerCommand): Promise<void> {
    await this.guard.assertNotSelf(containerId);
    const container = (await this.engine.listContainers()).find(
      (c) => c.id === containerId || c.name === containerId,
    );
    if (!container) throw new NotFoundError("container not found", "errors.notFound");
    await this.engine.recreateContainer(container.id, change, gate);
  }
}
