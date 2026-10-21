import { type Container, rulesExcluding } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler, QueryBus } from "@nestjs/cqrs";
import { ConflictError, NotFoundError, ValidationError } from "../../../../shared/domain-error.js";
import { ListContainersQuery } from "../../../docker/application/queries/list-containers.query.js";
import { helperConnected, settle, withRules } from "../../domain/guard-state.js";
import { GuardStore } from "../ports/guard-store.js";
import { SaveGuardRulesCommand } from "./save-guard-rules.command.js";

/**
 * Stores a new rule set. With a helper connected it goes on a 60-second trial that rolls back by
 * itself unless confirmed; without one it is simply stored until a helper connects. Rules that would
 * cut the caller off, or that guard Nautix itself, need an explicit acknowledgement.
 */
@CommandHandler(SaveGuardRulesCommand)
export class SaveGuardRulesHandler
  implements ICommandHandler<SaveGuardRulesCommand, { trialUntil: string | null }>
{
  constructor(
    @Inject(GuardStore) private readonly store: GuardStore,
    @Inject(QueryBus) private readonly queries: QueryBus,
  ) {}

  async execute({ rules, acknowledgeLockout, callerAddress }: SaveGuardRulesCommand) {
    const containers = await this.queries.execute<ListContainersQuery, Container[]>(
      new ListContainersQuery(),
    );
    for (const rule of rules) {
      const container = containers.find((c) => c.name === rule.container);
      if (!container) throw new NotFoundError("container not found", "errors.notFound");
      const published = container.ports.some(
        (p) =>
          p.privatePort === rule.port && p.type === rule.protocol && p.publicPort !== undefined,
      );
      if (!published)
        throw new ValidationError("that port is not published", "errors.portNotPublished");
    }
    if (!acknowledgeLockout) {
      if (rules.some((r) => containers.find((c) => c.name === r.container)?.isSelf))
        throw new ConflictError("this rule would guard Nautix itself", "errors.guardLockoutSelf");
      if (callerAddress && rulesExcluding(rules, callerAddress).length > 0)
        throw new ConflictError("these rules would cut your own access", "errors.guardLockout");
    }
    const now = Date.now();
    const current = settle(await this.store.load(), now);
    const state = withRules(current, rules, now, helperConnected(current, now));
    await this.store.save(state);
    return { trialUntil: state.pending ? new Date(state.pending.deadline).toISOString() : null };
  }
}
