import type { BindingPlan } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { BindingPlanner } from "../binding-planner.js";
import { PlanBindingQuery } from "./plan-binding.query.js";

/** What a binding would do, with passwords masked: nothing is changed. */
@QueryHandler(PlanBindingQuery)
export class PlanBindingHandler implements IQueryHandler<PlanBindingQuery, BindingPlan> {
  constructor(@Inject(BindingPlanner) private readonly planner: BindingPlanner) {}

  async execute(q: PlanBindingQuery): Promise<BindingPlan> {
    return (
      await this.planner.plan({
        consumer: q.consumer,
        provider: q.provider,
        name: q.name,
        style: q.style,
      })
    ).plan;
  }
}
