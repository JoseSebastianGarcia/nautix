import type { Container, GuardPlanDoc } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { type IQueryHandler, QueryBus, QueryHandler } from "@nestjs/cqrs";
import { ListContainersQuery } from "../../../docker/application/queries/list-containers.query.js";
import { planDoc, settle } from "../../domain/guard-state.js";
import { GuardStore } from "../ports/guard-store.js";
import { GetGuardPlanQuery } from "./get-guard-plan.query.js";

/** What the helper polls: the rules to enforce now, resolved to host ports. */
@QueryHandler(GetGuardPlanQuery)
export class GetGuardPlanHandler implements IQueryHandler<GetGuardPlanQuery, GuardPlanDoc> {
  constructor(
    @Inject(GuardStore) private readonly store: GuardStore,
    @Inject(QueryBus) private readonly queries: QueryBus,
  ) {}

  async execute({ markSeen }: GetGuardPlanQuery): Promise<GuardPlanDoc> {
    const now = Date.now();
    const loaded = await this.store.load();
    const settled = settle(loaded, now);
    const state = markSeen ? { ...settled, seenAt: now } : settled;
    if (state !== loaded) await this.store.save(state);
    const containers = await this.queries.execute<ListContainersQuery, Container[]>(
      new ListContainersQuery(),
    );
    return planDoc(state, containers);
  }
}
