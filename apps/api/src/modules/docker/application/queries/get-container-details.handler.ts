import type { ContainerDetails } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { DockerEngine } from "../ports/docker-engine.js";
import { GetContainerDetailsQuery } from "./get-container-details.query.js";

/** What was explicitly configured for each container (environment, command, restart policy, mounts). */
@QueryHandler(GetContainerDetailsQuery)
export class GetContainerDetailsHandler
  implements IQueryHandler<GetContainerDetailsQuery, ContainerDetails[]>
{
  constructor(@Inject(DockerEngine) private readonly engine: DockerEngine) {}

  execute({ ids }: GetContainerDetailsQuery): Promise<ContainerDetails[]> {
    return this.engine.inspectContainers(ids);
  }
}
