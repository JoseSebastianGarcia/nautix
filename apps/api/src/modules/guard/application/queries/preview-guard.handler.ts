import type { GuardPlanDoc } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { type IQueryHandler, QueryBus, QueryHandler } from "@nestjs/cqrs";
import type { GuardPlan } from "../../domain/guard-strategy.js";
import { guardStrategyFor } from "../../domain/strategies/index.js";
import { GetGuardPlanQuery } from "./get-guard-plan.query.js";
import { PreviewGuardQuery } from "./preview-guard.query.js";

/** The exact commands the helper would run for the current rules, shown before anything is enforced. */
@QueryHandler(PreviewGuardQuery)
export class PreviewGuardHandler implements IQueryHandler<PreviewGuardQuery, GuardPlan> {
  constructor(@Inject(QueryBus) private readonly queries: QueryBus) {}

  async execute({ backend }: PreviewGuardQuery): Promise<GuardPlan> {
    const doc = await this.queries.execute<GetGuardPlanQuery, GuardPlanDoc>(
      new GetGuardPlanQuery(),
    );
    return guardStrategyFor(backend).plan(doc.rules);
  }
}
