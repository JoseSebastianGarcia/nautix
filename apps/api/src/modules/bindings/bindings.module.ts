import { type DynamicModule, Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import type { AppConfig } from "../../shared/config.js";
import { openDatabase } from "../../shared/sqlite-database.js";
import { BindingPlanner } from "./application/binding-planner.js";
import { CreateBindingHandler } from "./application/commands/create-binding.handler.js";
import { DeleteBindingHandler } from "./application/commands/delete-binding.handler.js";
import { ReapplyBindingHandler } from "./application/commands/reapply-binding.handler.js";
import { BindingStore } from "./application/ports/binding-store.js";
import { ListBindingsHandler } from "./application/queries/list-bindings.handler.js";
import { PlanBindingHandler } from "./application/queries/plan-binding.handler.js";
import { SqliteBindingStore } from "./infrastructure/sqlite-binding.store.js";
import { BindingController } from "./presentation/binding.controller.js";

@Module({})
export class BindingsModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: BindingsModule,
      imports: [CqrsModule],
      controllers: [BindingController],
      providers: [
        {
          provide: BindingStore,
          useFactory: () => new SqliteBindingStore(openDatabase(config.dataDir)),
        },
        BindingPlanner,
        CreateBindingHandler,
        ReapplyBindingHandler,
        DeleteBindingHandler,
        ListBindingsHandler,
        PlanBindingHandler,
      ],
    };
  }
}
