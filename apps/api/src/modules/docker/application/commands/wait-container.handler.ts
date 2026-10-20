import type { WaitResult } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { DockerEngine } from "../ports/docker-engine.js";
import { WaitContainerCommand } from "./wait-container.command.js";

@CommandHandler(WaitContainerCommand)
export class WaitContainerHandler implements ICommandHandler<WaitContainerCommand, WaitResult> {
  constructor(@Inject(DockerEngine) private readonly engine: DockerEngine) {}

  async execute(q: WaitContainerCommand): Promise<WaitResult> {
    return this.engine.waitContainer(q.id, q.timeoutMs);
  }
}
