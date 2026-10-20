import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { type TerminalChannel, TerminalEngine } from "../ports/terminal-engine.js";
import { OpenTerminalCommand } from "./open-terminal.command.js";

@CommandHandler(OpenTerminalCommand)
export class OpenTerminalHandler implements ICommandHandler<OpenTerminalCommand, TerminalChannel> {
  constructor(@Inject(TerminalEngine) private readonly engine: TerminalEngine) {}

  execute({ containerId, cols, rows }: OpenTerminalCommand): Promise<TerminalChannel> {
    return this.engine.open(containerId, clamp(cols, 20, 500), clamp(rows, 5, 200));
  }
}

const clamp = (n: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Number.isFinite(n) ? Math.trunc(n) : min));
