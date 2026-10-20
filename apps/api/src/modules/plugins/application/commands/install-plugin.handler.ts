import type { PluginPrivilege } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { PluginEngine } from "../ports/plugin-engine.js";
import { InstallPluginCommand } from "./install-plugin.command.js";

@CommandHandler(InstallPluginCommand)
export class InstallPluginHandler implements ICommandHandler<InstallPluginCommand, void> {
  constructor(@Inject(PluginEngine) private readonly engine: PluginEngine) {}

  execute(c: InstallPluginCommand): Promise<void> {
    return this.engine.install(c.remote, c.privileges);
  }
}
