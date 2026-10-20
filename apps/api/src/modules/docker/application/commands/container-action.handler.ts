import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { DockerEngine } from "../ports/docker-engine.js";
import { SelfGuard } from "../self-guard.js";
import { ContainerActionCommand } from "./container-action.command.js";

const DESTRUCTIVE = new Set(["stop", "kill", "restart", "pause"]);

@CommandHandler(ContainerActionCommand)
export class ContainerActionHandler implements ICommandHandler<ContainerActionCommand, void> {
  constructor(
    @Inject(DockerEngine) private readonly engine: DockerEngine,
    @Inject(SelfGuard) private readonly guard: SelfGuard,
  ) {}

  async execute(c: ContainerActionCommand): Promise<void> {
    if (DESTRUCTIVE.has(c.action)) await this.guard.assertNotSelf(c.id);
    await this.engine.containerAction(c.id, c.action, c.options);
  }
}
