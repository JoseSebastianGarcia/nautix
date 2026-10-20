import { Inject } from "@nestjs/common";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { DockerEngine } from "../ports/docker-engine.js";
import { GetContainerLogsQuery } from "./get-container-logs.query.js";

@QueryHandler(GetContainerLogsQuery)
export class GetContainerLogsHandler implements IQueryHandler<GetContainerLogsQuery, string> {
  constructor(@Inject(DockerEngine) private readonly engine: DockerEngine) {}

  execute(q: GetContainerLogsQuery): Promise<string> {
    return this.engine.containerLogs(q.id, q.tail);
  }
}
