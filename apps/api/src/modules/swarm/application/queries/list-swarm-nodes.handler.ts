import type { SwarmNode } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { SwarmEngine } from "../ports/swarm-engine.js";
import { ListSwarmNodesQuery } from "./list-swarm-nodes.query.js";

@QueryHandler(ListSwarmNodesQuery)
export class ListSwarmNodesHandler implements IQueryHandler<ListSwarmNodesQuery, SwarmNode[]> {
  constructor(@Inject(SwarmEngine) private readonly engine: SwarmEngine) {}

  execute(c: ListSwarmNodesQuery): Promise<SwarmNode[]> {
    return this.engine.nodes();
  }
}
