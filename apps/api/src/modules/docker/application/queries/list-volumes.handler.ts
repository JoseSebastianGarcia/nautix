import type { Volume } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { DockerEngine } from "../ports/docker-engine.js";
import { ListVolumesQuery } from "./list-volumes.query.js";

@QueryHandler(ListVolumesQuery)
export class ListVolumesHandler implements IQueryHandler<ListVolumesQuery, Volume[]> {
  constructor(@Inject(DockerEngine) private readonly engine: DockerEngine) {}

  execute(): Promise<Volume[]> {
    return this.engine.listVolumes();
  }
}
