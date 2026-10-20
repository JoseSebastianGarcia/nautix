import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { registryOf } from "../../domain/registry-host.js";
import { DockerEngine } from "../ports/docker-engine.js";
import { RegistryStore } from "../ports/registry-store.js";
import { PullImageCommand } from "./pull-image.command.js";

@CommandHandler(PullImageCommand)
export class PullImageHandler implements ICommandHandler<PullImageCommand, void> {
  constructor(
    @Inject(DockerEngine) private readonly engine: DockerEngine,
    @Inject(RegistryStore) private readonly store: RegistryStore,
  ) {}

  execute(c: PullImageCommand): Promise<void> {
    return this.engine.pullImage(c.reference, this.store.find(registryOf(c.reference)));
  }
}
