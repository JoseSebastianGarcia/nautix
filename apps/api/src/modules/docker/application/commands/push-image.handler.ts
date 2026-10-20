import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { registryOf } from "../../domain/registry-host.js";
import { DockerEngine } from "../ports/docker-engine.js";
import { RegistryStore } from "../ports/registry-store.js";
import { PushImageCommand } from "./push-image.command.js";

@CommandHandler(PushImageCommand)
export class PushImageHandler implements ICommandHandler<PushImageCommand, string> {
  constructor(
    @Inject(DockerEngine) private readonly engine: DockerEngine,
    @Inject(RegistryStore) private readonly store: RegistryStore,
  ) {}

  /** Credentials typed in the dialog win; otherwise the saved login for that registry is used. */
  execute(q: PushImageCommand): Promise<string> {
    return this.engine.pushImage(q.reference, q.auth ?? this.store.find(registryOf(q.reference)));
  }
}
