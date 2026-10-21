import { type DynamicModule, Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import type { AppConfig } from "../../shared/config.js";
import { openDatabase } from "../../shared/sqlite-database.js";
import { ApplyZoneHandler } from "./application/commands/apply-zone.handler.js";
import { ZoneStore } from "./application/ports/zone-store.js";
import { DescribeZoneHandler } from "./application/queries/describe-zone.handler.js";
import { ListZonesHandler } from "./application/queries/list-zones.handler.js";
import { PlanZoneHandler } from "./application/queries/plan-zone.handler.js";
import { ZoneApplier } from "./application/zone-applier.js";
import { ZoneReader } from "./application/zone-reader.js";
import { SqliteZoneStore } from "./infrastructure/sqlite-zone.store.js";
import { ZoneController } from "./presentation/zone.controller.js";

@Module({})
export class ZonesModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: ZonesModule,
      imports: [CqrsModule],
      controllers: [ZoneController],
      providers: [
        { provide: ZoneStore, useFactory: () => new SqliteZoneStore(openDatabase(config.dataDir)) },
        ZoneReader,
        ZoneApplier,
        ApplyZoneHandler,
        DescribeZoneHandler,
        PlanZoneHandler,
        ListZonesHandler,
      ],
    };
  }
}
