import type { SwarmBindingPlan } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { SwarmBindingPlanner } from "../swarm-binding-planner.js";
import { PlanSwarmBindingQuery } from "./plan-swarm-binding.query.js";

/** What a binding would do, with passwords masked; changes nothing. */
@QueryHandler(PlanSwarmBindingQuery)
export class PlanSwarmBindingHandler
  implements IQueryHandler<PlanSwarmBindingQuery, SwarmBindingPlan>
{
  constructor(@Inject(SwarmBindingPlanner) private readonly planner: SwarmBindingPlanner) {}

  async execute({ input }: PlanSwarmBindingQuery): Promise<SwarmBindingPlan> {
    return (await this.planner.plan(input)).plan;
  }
}
