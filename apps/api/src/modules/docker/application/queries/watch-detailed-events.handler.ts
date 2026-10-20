import type { EngineEvent } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { DockerEngine } from "../ports/docker-engine.js";
import { WatchDetailedEventsQuery } from "./watch-detailed-events.query.js";

@QueryHandler(WatchDetailedEventsQuery)
export class WatchDetailedEventsHandler
  implements IQueryHandler<WatchDetailedEventsQuery, AsyncIterable<EngineEvent>>
{
  constructor(@Inject(DockerEngine) private readonly engine: DockerEngine) {}

  async execute(q: WatchDetailedEventsQuery): Promise<AsyncIterable<EngineEvent>> {
    return this.engine.detailedEvents(q.signal);
  }
}
