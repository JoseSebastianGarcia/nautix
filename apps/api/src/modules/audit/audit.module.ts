import { type DynamicModule, Global, Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import type { AppConfig } from "../../shared/config.js";
import { openDatabase } from "../../shared/sqlite-database.js";
import { AuditLog } from "./application/ports/audit-log.js";
import { SqliteAuditLog } from "./infrastructure/sqlite-audit-log.js";
import { AuditController } from "./presentation/audit.controller.js";
import { AuditInterceptor } from "./presentation/audit.interceptor.js";

@Global()
@Module({})
export class AuditModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: AuditModule,
      controllers: [AuditController],
      providers: [
        { provide: AuditLog, useFactory: () => new SqliteAuditLog(openDatabase(config.dataDir)) },
        { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
      ],
      exports: [AuditLog],
    };
  }
}
