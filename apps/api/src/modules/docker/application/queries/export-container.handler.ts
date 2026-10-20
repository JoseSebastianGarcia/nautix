import type { Readable } from "node:stream";
import { Inject } from "@nestjs/common";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { DockerEngine } from "../ports/docker-engine.js";
import { SelfGuard } from "../self-guard.js";
import { ExportContainerQuery } from "./export-container.query.js";

@QueryHandler(ExportContainerQuery)
export class ExportContainerHandler implements IQueryHandler<ExportContainerQuery, Readable> {
  constructor(
    @Inject(DockerEngine) private readonly engine: DockerEngine,
    @Inject(SelfGuard) private readonly guard: SelfGuard,
  ) {}

  async execute(q: ExportContainerQuery): Promise<Readable> {
    await this.guard.assertNotSelf(q.id);
    return this.engine.exportContainer(q.id);
  }
}
