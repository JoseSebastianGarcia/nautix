import { Inject } from "@nestjs/common";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { SwarmEngine } from "../ports/swarm-engine.js";
import { GetServiceLogsQuery } from "./get-service-logs.query.js";

@QueryHandler(GetServiceLogsQuery)
export class GetServiceLogsHandler implements IQueryHandler<GetServiceLogsQuery, string> {
  constructor(@Inject(SwarmEngine) private readonly engine: SwarmEngine) {}

  execute(c: GetServiceLogsQuery): Promise<string> {
    return this.engine.serviceLogs(c.id, c.tail);
  }
}
