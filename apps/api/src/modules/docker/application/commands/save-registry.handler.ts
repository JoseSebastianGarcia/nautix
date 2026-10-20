import type { RegistryInfo } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { normaliseServer, serverAddress } from "../../domain/registry-host.js";
import { DockerEngine } from "../ports/docker-engine.js";
import { RegistryStore } from "../ports/registry-store.js";
import { SaveRegistryCommand } from "./save-registry.command.js";

/** Checks the login against the registry first; only a working login is stored. */
@CommandHandler(SaveRegistryCommand)
export class SaveRegistryHandler implements ICommandHandler<SaveRegistryCommand, RegistryInfo> {
  constructor(
    @Inject(DockerEngine) private readonly engine: DockerEngine,
    @Inject(RegistryStore) private readonly store: RegistryStore,
  ) {}

  async execute({ registry }: SaveRegistryCommand): Promise<RegistryInfo> {
    const server = normaliseServer(registry.server);
    await this.engine.testRegistryAuth({
      username: registry.username,
      password: registry.password,
      serveraddress: serverAddress(server),
    });
    this.store.save(server, registry.username, registry.password);
    return { server, username: registry.username };
  }
}
