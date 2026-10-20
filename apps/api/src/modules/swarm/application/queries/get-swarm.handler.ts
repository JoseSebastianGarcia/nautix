import type { SwarmStatus } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { SwarmEngine } from "../ports/swarm-engine.js";
import { GetSwarmQuery } from "./get-swarm.query.js";

@QueryHandler(GetSwarmQuery)
export class GetSwarmHandler implements IQueryHandler<GetSwarmQuery, SwarmStatus> {
  constructor(@Inject(SwarmEngine) private readonly engine: SwarmEngine) {}

  execute(c: GetSwarmQuery): Promise<SwarmStatus> {
    return this.engine.status();
  }
}
