import type { ContainerTop } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { DockerEngine } from "../ports/docker-engine.js";
import { GetContainerTopQuery } from "./get-container-top.query.js";

@QueryHandler(GetContainerTopQuery)
export class GetContainerTopHandler implements IQueryHandler<GetContainerTopQuery, ContainerTop> {
  constructor(@Inject(DockerEngine) private readonly engine: DockerEngine) {}

  async execute(q: GetContainerTopQuery): Promise<ContainerTop> {
    return this.engine.containerTop(q.id);
  }
}
