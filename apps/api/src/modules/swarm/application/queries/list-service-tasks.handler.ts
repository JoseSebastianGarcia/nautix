import type { SwarmTask } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { SwarmEngine } from "../ports/swarm-engine.js";
import { ListServiceTasksQuery } from "./list-service-tasks.query.js";

@QueryHandler(ListServiceTasksQuery)
export class ListServiceTasksHandler implements IQueryHandler<ListServiceTasksQuery, SwarmTask[]> {
  constructor(@Inject(SwarmEngine) private readonly engine: SwarmEngine) {}

  execute(c: ListServiceTasksQuery): Promise<SwarmTask[]> {
    return this.engine.tasks(c.id);
  }
}
