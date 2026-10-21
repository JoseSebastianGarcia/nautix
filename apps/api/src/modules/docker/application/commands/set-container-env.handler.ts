import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { NotFoundError } from "../../../../shared/domain-error.js";
import { DockerEngine } from "../ports/docker-engine.js";
import { SelfGuard } from "../self-guard.js";
import { SetContainerEnvCommand } from "./set-container-env.command.js";

/**
 * Edits the environment of a container. Docker cannot change it in place, so the container is
 * recreated through the health gate: if the new one does not come up, the original is put back.
 * Values are never returned, only the names that changed.
 */
@CommandHandler(SetContainerEnvCommand)
export class SetContainerEnvHandler
  implements ICommandHandler<SetContainerEnvCommand, { changed: string[] }>
{
  constructor(
    @Inject(DockerEngine) private readonly engine: DockerEngine,
    @Inject(SelfGuard) private readonly guard: SelfGuard,
  ) {}

  async execute({ containerId, set, unset, gate }: SetContainerEnvCommand) {
    await this.guard.assertNotSelf(containerId);
    const container = (await this.engine.listContainers()).find(
      (c) => c.id === containerId || c.name === containerId,
    );
    if (!container) throw new NotFoundError("container not found", "errors.notFound");
    const env: Record<string, string | null> = { ...set };
    for (const key of unset) env[key] = null;
    await this.engine.recreateContainer(container.id, { env }, gate);
    return { changed: Object.keys(env).sort() };
  }
}
