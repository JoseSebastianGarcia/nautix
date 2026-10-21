import { type DynamicModule, Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import type { AppConfig } from "../../shared/config.js";
import { openDatabase } from "../../shared/sqlite-database.js";
import { ConfirmGuardHandler } from "./application/commands/confirm-guard.handler.js";
import { CreateGuardTokenHandler } from "./application/commands/create-guard-token.handler.js";
import { DisableGuardHandler } from "./application/commands/disable-guard.handler.js";
import { ReportGuardHandler } from "./application/commands/report-guard.handler.js";
import { SaveGuardRulesHandler } from "./application/commands/save-guard-rules.handler.js";
import { GuardStore } from "./application/ports/guard-store.js";
import { GetGuardPlanHandler } from "./application/queries/get-guard-plan.handler.js";
import { GetGuardStatusHandler } from "./application/queries/get-guard-status.handler.js";
import { PreviewGuardHandler } from "./application/queries/preview-guard.handler.js";
import { VerifyGuardTokenHandler } from "./application/queries/verify-guard-token.handler.js";
import { SqliteGuardStore } from "./infrastructure/sqlite-guard.store.js";
import { GuardController } from "./presentation/guard.controller.js";

@Module({})
export class GuardModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: GuardModule,
      imports: [CqrsModule],
      controllers: [GuardController],
      providers: [
        {
          provide: GuardStore,
          useFactory: () => new SqliteGuardStore(openDatabase(config.dataDir)),
        },
        SaveGuardRulesHandler,
        ConfirmGuardHandler,
        DisableGuardHandler,
        CreateGuardTokenHandler,
        ReportGuardHandler,
        GetGuardStatusHandler,
        GetGuardPlanHandler,
        PreviewGuardHandler,
        VerifyGuardTokenHandler,
      ],
    };
  }
}
