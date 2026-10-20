import type { FsChange } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { DockerEngine } from "../ports/docker-engine.js";
import { GetContainerDiffQuery } from "./get-container-diff.query.js";

@QueryHandler(GetContainerDiffQuery)
export class GetContainerDiffHandler implements IQueryHandler<GetContainerDiffQuery, FsChange[]> {
  constructor(@Inject(DockerEngine) private readonly engine: DockerEngine) {}

  async execute(q: GetContainerDiffQuery): Promise<FsChange[]> {
    return this.engine.containerDiff(q.id);
  }
}
