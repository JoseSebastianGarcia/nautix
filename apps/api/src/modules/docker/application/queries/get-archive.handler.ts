import type { Readable } from "node:stream";
import { Inject } from "@nestjs/common";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { DockerEngine } from "../ports/docker-engine.js";
import { SelfGuard } from "../self-guard.js";
import { GetArchiveQuery } from "./get-archive.query.js";

@QueryHandler(GetArchiveQuery)
export class GetArchiveHandler implements IQueryHandler<GetArchiveQuery, Readable> {
  constructor(
    @Inject(DockerEngine) private readonly engine: DockerEngine,
    @Inject(SelfGuard) private readonly guard: SelfGuard,
  ) {}

  async execute(q: GetArchiveQuery): Promise<Readable> {
    await this.guard.assertNotSelf(q.id);
    return this.engine.getArchive(q.id, q.path);
  }
}
