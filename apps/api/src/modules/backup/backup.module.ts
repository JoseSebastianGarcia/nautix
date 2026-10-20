import { type DynamicModule, Module } from "@nestjs/common";
import type { AppConfig } from "../../shared/config.js";
import { BackupService, Restarter } from "./application/ports/backup-service.js";
import { FileBackupService } from "./infrastructure/file-backup-service.js";
import { BackupController } from "./presentation/backup.controller.js";

/** Exits so the container's restart policy starts Nautix again with the restored data. */
class ProcessRestarter extends Restarter {
  restartSoon(): void {
    setTimeout(() => process.exit(0), 800).unref();
  }
}

@Module({})
export class BackupModule {
  static register(config: AppConfig, restarter: Restarter = new ProcessRestarter()): DynamicModule {
    return {
      module: BackupModule,
      controllers: [BackupController],
      providers: [
        { provide: BackupService, useValue: new FileBackupService(config.dataDir) },
        { provide: Restarter, useValue: restarter },
      ],
    };
  }
}
