import { type DynamicModule, Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import type { AppConfig } from "../../shared/config.js";
import { openDatabase } from "../../shared/sqlite-database.js";
import { DeleteComposeProjectHandler } from "./application/commands/delete-compose-project.handler.js";
import { RunComposeActionHandler } from "./application/commands/run-compose-action.handler.js";
import { SaveComposeProjectHandler } from "./application/commands/save-compose-project.handler.js";
import { ComposeProjectRepository } from "./application/ports/compose-project-repository.js";
import { ComposeRunner } from "./application/ports/compose-runner.js";
import { GetComposeProjectHandler } from "./application/queries/get-compose-project.handler.js";
import { ListComposeProjectsHandler } from "./application/queries/list-compose-projects.handler.js";
import { FakeComposeRunner } from "./infrastructure/fake-compose-runner.js";
import { ProcessComposeRunner } from "./infrastructure/process-compose-runner.js";
import { SqliteComposeProjectRepository } from "./infrastructure/sqlite-compose-project.repository.js";
import { ComposeController } from "./presentation/compose.controller.js";

@Module({})
export class ComposeModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: ComposeModule,
      imports: [CqrsModule],
      controllers: [ComposeController],
      providers: [
        {
          provide: ComposeProjectRepository,
          useFactory: () => new SqliteComposeProjectRepository(openDatabase(config.dataDir)),
        },
        {
          provide: ComposeRunner,
          useFactory: () =>
            config.engine === "fake"
              ? new FakeComposeRunner()
              : new ProcessComposeRunner({
                  dockerBin: process.env.NAUTIX_DOCKER_BIN ?? "docker",
                  dataDir: config.dataDir,
                  socketPath: config.dockerSocket,
                  timeoutMs: 10 * 60 * 1000,
                }),
        },
        SaveComposeProjectHandler,
        DeleteComposeProjectHandler,
        RunComposeActionHandler,
        GetComposeProjectHandler,
        ListComposeProjectsHandler,
      ],
    };
  }
}
