import type { ComposeProject } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { NotFoundError } from "../../../../shared/domain-error.js";
import { ComposeProjectRepository } from "../ports/compose-project-repository.js";
import { GetComposeProjectQuery } from "./get-compose-project.query.js";

@QueryHandler(GetComposeProjectQuery)
export class GetComposeProjectHandler
  implements IQueryHandler<GetComposeProjectQuery, ComposeProject>
{
  constructor(
    @Inject(ComposeProjectRepository) private readonly projects: ComposeProjectRepository,
  ) {}

  async execute({ name }: GetComposeProjectQuery): Promise<ComposeProject> {
    const project = await this.projects.get(name);
    if (!project) throw new NotFoundError("project not found", "errors.notFound");
    return project;
  }
}
