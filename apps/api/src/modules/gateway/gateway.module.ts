import { type DynamicModule, Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import type { AppConfig } from "../../shared/config.js";
import { openDatabase } from "../../shared/sqlite-database.js";
import { SaveGatewayRoutesHandler } from "./application/commands/save-gateway-routes.handler.js";
import { GatewayRoutesRepository } from "./application/ports/gateway-routes-repository.js";
import { GetGatewayRoutesHandler } from "./application/queries/get-gateway-routes.handler.js";
import { SqliteGatewayRoutesRepository } from "./infrastructure/sqlite-gateway-routes.repository.js";
import { GatewayController } from "./presentation/gateway.controller.js";

@Module({})
export class GatewayModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: GatewayModule,
      imports: [CqrsModule],
      controllers: [GatewayController],
      providers: [
        {
          provide: GatewayRoutesRepository,
          useFactory: () => new SqliteGatewayRoutesRepository(openDatabase(config.dataDir)),
        },
        GetGatewayRoutesHandler,
        SaveGatewayRoutesHandler,
      ],
    };
  }
}
