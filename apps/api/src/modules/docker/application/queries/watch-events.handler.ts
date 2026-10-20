import { Inject } from "@nestjs/common";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { DockerEngine, type EngineEventKind } from "../ports/docker-engine.js";
import { WatchEventsQuery } from "./watch-events.query.js";

@QueryHandler(WatchEventsQuery)
export class WatchEventsHandler
  implements IQueryHandler<WatchEventsQuery, AsyncIterable<EngineEventKind>>
{
  constructor(@Inject(DockerEngine) private readonly engine: DockerEngine) {}

  async execute({ signal }: WatchEventsQuery): Promise<AsyncIterable<EngineEventKind>> {
    return this.engine.events(signal);
  }
}
