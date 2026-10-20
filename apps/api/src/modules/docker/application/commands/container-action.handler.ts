import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { DockerEngine } from "../ports/docker-engine.js";
import { ContainerActionCommand } from "./container-action.command.js";

@CommandHandler(ContainerActionCommand)
export class ContainerActionHandler implements ICommandHandler<ContainerActionCommand, void> {
  constructor(@Inject(DockerEngine) private readonly engine: DockerEngine) {}

  execute(c: ContainerActionCommand): Promise<void> {
    return this.engine.containerAction(c.id, c.action);
  }
}
