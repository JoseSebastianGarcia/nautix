import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { NotFoundError } from "../../../../shared/domain-error.js";
import { normaliseServer } from "../../domain/registry-host.js";
import { RegistryStore } from "../ports/registry-store.js";
import { RemoveRegistryCommand } from "./remove-registry.command.js";

@CommandHandler(RemoveRegistryCommand)
export class RemoveRegistryHandler implements ICommandHandler<RemoveRegistryCommand, void> {
  constructor(@Inject(RegistryStore) private readonly store: RegistryStore) {}

  async execute({ server }: RemoveRegistryCommand): Promise<void> {
    if (!this.store.remove(normaliseServer(server)))
      throw new NotFoundError("registry not found", "errors.notFound");
  }
}
