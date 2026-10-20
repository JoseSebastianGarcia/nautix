import type { ContainerStats } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { DockerEngine } from "../ports/docker-engine.js";
import { GetContainerStatsQuery } from "./get-container-stats.query.js";

@QueryHandler(GetContainerStatsQuery)
export class GetContainerStatsHandler
  implements IQueryHandler<GetContainerStatsQuery, ContainerStats>
{
  constructor(@Inject(DockerEngine) private readonly engine: DockerEngine) {}

  async execute(q: GetContainerStatsQuery): Promise<ContainerStats> {
    return this.engine.containerStats(q.id);
  }
}
