import type { Binding } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { CommandBus, CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { NotFoundError } from "../../../../shared/domain-error.js";
import { RecreateContainerCommand } from "../../../docker/application/commands/recreate-container.command.js";
import { BindingPlanner } from "../binding-planner.js";
import { BindingStore } from "../ports/binding-store.js";
import { ReapplyBindingCommand } from "./reapply-binding.command.js";

/** Writes the provider's current settings into the consumer again (a password changed, for example). */
@CommandHandler(ReapplyBindingCommand)
export class ReapplyBindingHandler implements ICommandHandler<ReapplyBindingCommand, Binding> {
  constructor(
    @Inject(BindingPlanner) private readonly planner: BindingPlanner,
    @Inject(BindingStore) private readonly store: BindingStore,
    @Inject(CommandBus) private readonly commands: CommandBus,
  ) {}

  async execute({ id }: ReapplyBindingCommand): Promise<Binding> {
    const binding = await this.store.get(id);
    if (!binding) throw new NotFoundError("binding not found", "errors.notFound");
    const planned = await this.planner.plan({
      consumer: binding.consumer,
      provider: binding.provider,
      name: binding.name,
      style: binding.style,
    });
    const keys = Object.keys(planned.variables);
    const env: Record<string, string | null> = { ...planned.variables };
    for (const old of binding.variables) if (!keys.includes(old)) env[old] = null;
    await this.commands.execute(
      new RecreateContainerCommand(planned.consumer.id, {
        env,
        ...(planned.plan.joins ? { joinNetworks: [planned.plan.network] } : {}),
      }),
    );
    const updated = { ...binding, kind: planned.kind, variables: keys };
    await this.store.save(updated);
    return updated;
  }
}
