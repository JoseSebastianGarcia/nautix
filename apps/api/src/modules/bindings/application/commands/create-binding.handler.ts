import { randomUUID } from "node:crypto";
import { type Binding, bindingKind } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { CommandBus, CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { ConflictError } from "../../../../shared/domain-error.js";
import { RecreateContainerCommand } from "../../../docker/application/commands/recreate-container.command.js";
import { BindingPlanner } from "../binding-planner.js";
import { BindingStore } from "../ports/binding-store.js";
import { CreateBindingCommand } from "./create-binding.command.js";

/**
 * Wires a consumer to a provider: joins the network, gives it the connection settings and recreates
 * it behind the health gate. The binding is stored only when that worked.
 */
@CommandHandler(CreateBindingCommand)
export class CreateBindingHandler implements ICommandHandler<CreateBindingCommand, Binding> {
  constructor(
    @Inject(BindingPlanner) private readonly planner: BindingPlanner,
    @Inject(BindingStore) private readonly store: BindingStore,
    @Inject(CommandBus) private readonly commands: CommandBus,
  ) {}

  async execute({ input }: CreateBindingCommand): Promise<Binding> {
    const planned = await this.planner.plan(input);
    const existing = await this.store.list();
    const keys = Object.keys(planned.variables);
    const clash = existing.find(
      (b) => b.consumer === planned.consumer.name && b.variables.some((v) => keys.includes(v)),
    );
    if (clash)
      throw new ConflictError(
        "this app already has a binding with that name",
        "errors.bindingExists",
      );
    await this.commands.execute(
      new RecreateContainerCommand(
        planned.consumer.id,
        {
          env: planned.variables,
          ...(planned.plan.joins ? { joinNetworks: [planned.plan.network] } : {}),
        },
        input.gate,
      ),
    );
    const binding: Binding = {
      id: randomUUID(),
      consumer: planned.consumer.name,
      provider: planned.provider.name,
      kind: bindingKind(planned.provider.image),
      name: planned.name,
      style: input.style,
      variables: keys,
    };
    await this.store.save(binding);
    return binding;
  }
}
