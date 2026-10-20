import { Inject } from "@nestjs/common";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { DockerEngine } from "../ports/docker-engine.js";
import { GetVersionQuery } from "./get-version.query.js";

@QueryHandler(GetVersionQuery)
export class GetVersionHandler implements IQueryHandler<GetVersionQuery, unknown> {
  constructor(@Inject(DockerEngine) private readonly engine: DockerEngine) {}

  execute(): Promise<unknown> {
    return this.engine.version();
  }
}
