import { Inject } from "@nestjs/common";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { DockerEngine } from "../ports/docker-engine.js";
import { GetRawInfoQuery } from "./get-raw-info.query.js";

@QueryHandler(GetRawInfoQuery)
export class GetRawInfoHandler implements IQueryHandler<GetRawInfoQuery, unknown> {
  constructor(@Inject(DockerEngine) private readonly engine: DockerEngine) {}

  execute(): Promise<unknown> {
    return this.engine.rawInfo();
  }
}
