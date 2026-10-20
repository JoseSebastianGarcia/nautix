import { type DynamicModule, Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import type { AppConfig } from "../../shared/config.js";
import { type Db, openDatabase } from "../../shared/sqlite-database.js";
import { SaveLayoutHandler } from "./application/commands/save-layout.handler.js";
import { LayoutRepository } from "./application/ports/layout-repository.js";
import { GetLayoutHandler } from "./application/queries/get-layout.handler.js";
import { SqliteLayoutRepository } from "./infrastructure/sqlite-layout.repository.js";
import { LayoutController } from "./presentation/layout.controller.js";

@Module({})
export class LayoutModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: LayoutModule,
      imports: [CqrsModule],
      controllers: [LayoutController],
      providers: [
        {
          provide: LayoutRepository,
          useFactory: () => new SqliteLayoutRepository(openDatabase(config.dataDir) as Db),
        },
        GetLayoutHandler,
        SaveLayoutHandler,
      ],
    };
  }
}
