import type { Container } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { DockerEngine } from "../ports/docker-engine.js";
import { ListContainersQuery } from "./list-containers.query.js";

@QueryHandler(ListContainersQuery)
export class ListContainersHandler implements IQueryHandler<ListContainersQuery, Container[]> {
  constructor(@Inject(DockerEngine) private readonly engine: DockerEngine) {}

  execute(): Promise<Container[]> {
    return this.engine.listContainers();
  }
}
