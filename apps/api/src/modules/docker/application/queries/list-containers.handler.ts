import type { Container } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { DockerEngine } from "../ports/docker-engine.js";
import { SelfIdentity } from "../ports/self-identity.js";
import { ListContainersQuery } from "./list-containers.query.js";

@QueryHandler(ListContainersQuery)
export class ListContainersHandler implements IQueryHandler<ListContainersQuery, Container[]> {
  constructor(
    @Inject(DockerEngine) private readonly engine: DockerEngine,
    @Inject(SelfIdentity) private readonly self: SelfIdentity,
  ) {}

  async execute(): Promise<Container[]> {
    return (await this.engine.listContainers()).map((c) =>
      this.self.matches(c) ? { ...c, isSelf: true } : c,
    );
  }
}
