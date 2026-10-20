import { type DynamicModule, Module } from "@nestjs/common";
import { AuditModule } from "./modules/audit/audit.module.js";
import { AuthModule } from "./modules/auth/auth.module.js";
import { HealthController } from "./modules/auth/presentation/health.controller.js";
import type { Restarter } from "./modules/backup/application/ports/backup-service.js";
import { BackupModule } from "./modules/backup/backup.module.js";
import { CatalogModule } from "./modules/catalog/catalog.module.js";
import { ComposeModule } from "./modules/compose/compose.module.js";
import { DockerModule } from "./modules/docker/docker.module.js";
import { GatewayModule } from "./modules/gateway/gateway.module.js";
import { LayoutModule } from "./modules/layout/layout.module.js";
import { TerminalModule } from "./modules/terminal/terminal.module.js";
import type { TlsCertificates } from "./modules/tls/application/ports/tls-certificates.js";
import { TlsModule } from "./modules/tls/tls.module.js";
import type { AppConfig } from "./shared/config.js";

@Module({})
export class AppModule {
  static register(config: AppConfig, tls?: TlsCertificates, restarter?: Restarter): DynamicModule {
    return {
      module: AppModule,
      imports: [
        AuditModule.register(config),
        AuthModule.register(config),
        DockerModule.register(config),
        TerminalModule.register(config),
        LayoutModule.register(config),
        ComposeModule.register(config),
        CatalogModule.register(config),
        GatewayModule.register(config),
        TlsModule.register(tls),
        BackupModule.register(config, restarter),
      ],
      controllers: [HealthController],
    };
  }
}
