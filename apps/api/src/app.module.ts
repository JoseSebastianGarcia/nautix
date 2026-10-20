import { type DynamicModule, Module } from "@nestjs/common";
import { AuthModule } from "./modules/auth/auth.module.js";
import { HealthController } from "./modules/auth/presentation/health.controller.js";
import { DockerModule } from "./modules/docker/docker.module.js";
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
      ],
      controllers: [HealthController],
    };
  }
}
