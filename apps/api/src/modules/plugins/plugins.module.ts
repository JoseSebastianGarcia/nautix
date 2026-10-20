import { type DynamicModule, Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import type { AppConfig } from "../../shared/config.js";
import { InstallPluginHandler } from "./application/commands/install-plugin.handler.js";
import { RemovePluginHandler } from "./application/commands/remove-plugin.handler.js";
import { SetPluginEnabledHandler } from "./application/commands/set-plugin-enabled.handler.js";
import { PluginEngine } from "./application/ports/plugin-engine.js";
import { GetPluginPrivilegesHandler } from "./application/queries/get-plugin-privileges.handler.js";
import { ListPluginsHandler } from "./application/queries/list-plugins.handler.js";
import { DockerSocketPluginEngine } from "./infrastructure/docker-socket-plugin-engine.js";
import { FakePluginEngine } from "./infrastructure/fake-plugin-engine.js";
import { PluginsController } from "./presentation/plugins.controller.js";

@Module({})
export class PluginsModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: PluginsModule,
      imports: [CqrsModule],
      controllers: [PluginsController],
      providers: [
        {
          provide: PluginEngine,
          useFactory: () =>
            config.engine === "fake"
              ? new FakePluginEngine()
              : new DockerSocketPluginEngine(config.dockerSocket),
        },
        ListPluginsHandler,
        GetPluginPrivilegesHandler,
        InstallPluginHandler,
        SetPluginEnabledHandler,
        RemovePluginHandler,
      ],
    };
  }
}
