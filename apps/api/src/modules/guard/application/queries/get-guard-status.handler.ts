import type { Container, GuardStatus } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { type IQueryHandler, QueryBus, QueryHandler } from "@nestjs/cqrs";
import { ListContainersQuery } from "../../../docker/application/queries/list-containers.query.js";
import { helperConnected, settle } from "../../domain/guard-state.js";
import { resolveGuardRules } from "../../domain/resolve-rules.js";
import { GuardStore } from "../ports/guard-store.js";
import { GetGuardStatusQuery } from "./get-guard-status.query.js";

@QueryHandler(GetGuardStatusQuery)
export class GetGuardStatusHandler implements IQueryHandler<GetGuardStatusQuery, GuardStatus> {
  constructor(
    @Inject(GuardStore) private readonly store: GuardStore,
    @Inject(QueryBus) private readonly queries: QueryBus,
  ) {}

  async execute(): Promise<GuardStatus> {
    const now = Date.now();
    const loaded = await this.store.load();
    const state = settle(loaded, now);
    if (state !== loaded) await this.store.save(state);
    const containers = await this.queries.execute<ListContainersQuery, Container[]>(
      new ListContainersQuery(),
    );
    const active = state.pending?.rules ?? state.confirmed;
    const report = state.report;
    return {
      helper: {
        connected: helperConnected(state, now),
        lastSeen: state.seenAt ? new Date(state.seenAt).toISOString() : null,
        backend: report?.backend ?? null,
        appliedRevision: report?.revision ?? null,
        ok: report?.ok ?? null,
        error: report?.error ?? null,
      },
      tokenSet: await this.store.hasToken(),
      revision: state.revision,
      rules: state.confirmed,
      trial: state.pending
        ? { rules: state.pending.rules, deadline: new Date(state.pending.deadline).toISOString() }
        : null,
      unresolved: resolveGuardRules(active, containers).unresolved,
    };
  }
}
