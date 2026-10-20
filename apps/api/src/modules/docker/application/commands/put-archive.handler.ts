import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { DockerEngine } from "../ports/docker-engine.js";
import { SelfGuard } from "../self-guard.js";
import { PutArchiveCommand } from "./put-archive.command.js";

@CommandHandler(PutArchiveCommand)
export class PutArchiveHandler implements ICommandHandler<PutArchiveCommand, void> {
  constructor(
    @Inject(DockerEngine) private readonly engine: DockerEngine,
    @Inject(SelfGuard) private readonly guard: SelfGuard,
  ) {}

  async execute(q: PutArchiveCommand): Promise<void> {
    await this.guard.assertNotSelf(q.id);
    return this.engine.putArchive(q.id, q.path, q.tar);
  }
}
