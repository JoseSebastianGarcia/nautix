import type { SwarmItem } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { SwarmEngine } from "../ports/swarm-engine.js";
import { ListSwarmSecretsQuery } from "./list-swarm-secrets.query.js";

@QueryHandler(ListSwarmSecretsQuery)
export class ListSwarmSecretsHandler implements IQueryHandler<ListSwarmSecretsQuery, SwarmItem[]> {
  constructor(@Inject(SwarmEngine) private readonly engine: SwarmEngine) {}

  execute(c: ListSwarmSecretsQuery): Promise<SwarmItem[]> {
    return this.engine.secrets();
  }
}
