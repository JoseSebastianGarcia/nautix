import { type DynamicModule, Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import type { AppConfig } from "../../shared/config.js";
import { openDatabase } from "../../shared/sqlite-database.js";
import { DeleteCustomTemplateHandler } from "./application/commands/delete-custom-template.handler.js";
import { SaveCustomTemplateHandler } from "./application/commands/save-custom-template.handler.js";
import { CustomTemplateRepository } from "./application/ports/custom-template-repository.js";
import { ListCatalogHandler } from "./application/queries/list-catalog.handler.js";
import { SqliteCustomTemplateRepository } from "./infrastructure/sqlite-custom-template.repository.js";
import { CatalogController } from "./presentation/catalog.controller.js";

@Module({})
export class CatalogModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: CatalogModule,
      imports: [CqrsModule],
      controllers: [CatalogController],
      providers: [
        {
          provide: CustomTemplateRepository,
          useFactory: () => new SqliteCustomTemplateRepository(openDatabase(config.dataDir)),
        },
        ListCatalogHandler,
        SaveCustomTemplateHandler,
        DeleteCustomTemplateHandler,
      ],
    };
  }
}
