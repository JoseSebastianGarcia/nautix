import type { EngineInfo } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { DockerEngine } from "../ports/docker-engine.js";
import { GetEngineInfoQuery } from "./get-engine-info.query.js";

@QueryHandler(GetEngineInfoQuery)
export class GetEngineInfoHandler implements IQueryHandler<GetEngineInfoQuery, EngineInfo> {
  constructor(@Inject(DockerEngine) private readonly engine: DockerEngine) {}

  execute(): Promise<EngineInfo> {
    return this.engine.info();
  }
}
