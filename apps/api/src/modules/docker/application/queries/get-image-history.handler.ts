import type { ImageHistoryEntry } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { DockerEngine } from "../ports/docker-engine.js";
import { GetImageHistoryQuery } from "./get-image-history.query.js";

@QueryHandler(GetImageHistoryQuery)
export class GetImageHistoryHandler
  implements IQueryHandler<GetImageHistoryQuery, ImageHistoryEntry[]>
{
  constructor(@Inject(DockerEngine) private readonly engine: DockerEngine) {}

  execute(q: GetImageHistoryQuery): Promise<ImageHistoryEntry[]> {
    return this.engine.imageHistory(q.ref);
  }
}
