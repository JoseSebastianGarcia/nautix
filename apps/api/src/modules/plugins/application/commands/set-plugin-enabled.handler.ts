import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { PluginEngine } from "../ports/plugin-engine.js";
import { SetPluginEnabledCommand } from "./set-plugin-enabled.command.js";

@CommandHandler(SetPluginEnabledCommand)
export class SetPluginEnabledHandler implements ICommandHandler<SetPluginEnabledCommand, void> {
  constructor(@Inject(PluginEngine) private readonly engine: PluginEngine) {}

  execute(c: SetPluginEnabledCommand): Promise<void> {
    return this.engine.setEnabled(c.name, c.enabled);
  }
}
