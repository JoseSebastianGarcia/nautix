import type { SwarmService } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { SwarmEngine } from "../ports/swarm-engine.js";
import { ListSwarmServicesQuery } from "./list-swarm-services.query.js";

@QueryHandler(ListSwarmServicesQuery)
export class ListSwarmServicesHandler
  implements IQueryHandler<ListSwarmServicesQuery, SwarmService[]>
{
  constructor(@Inject(SwarmEngine) private readonly engine: SwarmEngine) {}

  execute(c: ListSwarmServicesQuery): Promise<SwarmService[]> {
    return this.engine.services();
  }
}
