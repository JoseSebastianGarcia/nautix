import type { SwarmItem } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { SwarmEngine } from "../ports/swarm-engine.js";
import { ListSwarmConfigsQuery } from "./list-swarm-configs.query.js";

@QueryHandler(ListSwarmConfigsQuery)
export class ListSwarmConfigsHandler implements IQueryHandler<ListSwarmConfigsQuery, SwarmItem[]> {
  constructor(@Inject(SwarmEngine) private readonly engine: SwarmEngine) {}

  execute(c: ListSwarmConfigsQuery): Promise<SwarmItem[]> {
    return this.engine.configs();
  }
}
