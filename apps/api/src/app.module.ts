import { type DynamicModule, Module } from "@nestjs/common";
import { AuthModule } from "./modules/auth/auth.module.js";
import { HealthController } from "./modules/auth/presentation/health.controller.js";
import { CatalogModule } from "./modules/catalog/catalog.module.js";
import { ComposeModule } from "./modules/compose/compose.module.js";
import { DockerModule } from "./modules/docker/docker.module.js";
import { LayoutModule } from "./modules/layout/layout.module.js";
import { TerminalModule } from "./modules/terminal/terminal.module.js";
import type { AppConfig } from "./shared/config.js";

@Module({})
export class AppModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        AuthModule.register(config),
        DockerModule.register(config),
        TerminalModule.register(config),
        LayoutModule.register(config),
        ComposeModule.register(config),
        CatalogModule.register(config),
      ],
      controllers: [HealthController],
    };
  }
}
