import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { PluginEngine } from "../ports/plugin-engine.js";
import { RemovePluginCommand } from "./remove-plugin.command.js";

@CommandHandler(RemovePluginCommand)
export class RemovePluginHandler implements ICommandHandler<RemovePluginCommand, void> {
  constructor(@Inject(PluginEngine) private readonly engine: PluginEngine) {}

  execute(c: RemovePluginCommand): Promise<void> {
    return this.engine.remove(c.name, c.force);
  }
}
