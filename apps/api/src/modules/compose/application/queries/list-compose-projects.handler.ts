import type { ComposeProjectSummary } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { ComposeProjectRepository } from "../ports/compose-project-repository.js";
import { ListComposeProjectsQuery } from "./list-compose-projects.query.js";

@QueryHandler(ListComposeProjectsQuery)
export class ListComposeProjectsHandler
  implements IQueryHandler<ListComposeProjectsQuery, ComposeProjectSummary[]>
{
  constructor(
    @Inject(ComposeProjectRepository) private readonly projects: ComposeProjectRepository,
  ) {}

  execute(): Promise<ComposeProjectSummary[]> {
    return this.projects.list();
  }
}
