import { type DynamicModule, Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import type { AppConfig } from "../../shared/config.js";
import { OpenTerminalHandler } from "./application/commands/open-terminal.handler.js";
import { TerminalEngine } from "./application/ports/terminal-engine.js";
import { FakeTerminalEngine } from "./infrastructure/fake-terminal-engine.js";
import { SocketTerminalEngine } from "./infrastructure/socket-terminal-engine.js";
import { TerminalGateway } from "./presentation/terminal.gateway.js";

@Module({})
export class TerminalModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: TerminalModule,
      imports: [CqrsModule],
      providers: [
        {
          provide: TerminalEngine,
          useFactory: () =>
            config.engine === "fake"
              ? new FakeTerminalEngine()
              : new SocketTerminalEngine(config.dockerSocket),
        },
        OpenTerminalHandler,
        TerminalGateway,
      ],
    };
  }
}
