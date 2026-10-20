import { type DynamicModule, Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import type { AppConfig } from "../../shared/config.js";
import { openDatabase } from "../../shared/sqlite-database.js";
import { SaveDnsRecordsHandler } from "./application/commands/save-dns-records.handler.js";
import { DnsRecordsRepository } from "./application/ports/dns-records-repository.js";
import { GetDnsRecordsHandler } from "./application/queries/get-dns-records.handler.js";
import { SqliteDnsRecordsRepository } from "./infrastructure/sqlite-dns-records.repository.js";
import { DnsController } from "./presentation/dns.controller.js";

@Module({})
export class DnsModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: DnsModule,
      imports: [CqrsModule],
      controllers: [DnsController],
      providers: [
        {
          provide: DnsRecordsRepository,
          useFactory: () => new SqliteDnsRecordsRepository(openDatabase(config.dataDir)),
        },
        GetDnsRecordsHandler,
        SaveDnsRecordsHandler,
      ],
    };
  }
}
