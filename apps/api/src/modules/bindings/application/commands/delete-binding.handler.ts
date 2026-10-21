import type { Container } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { CommandBus, CommandHandler, type ICommandHandler, QueryBus } from "@nestjs/cqrs";
import { NotFoundError } from "../../../../shared/domain-error.js";
import { RecreateContainerCommand } from "../../../docker/application/commands/recreate-container.command.js";
import { ListContainersQuery } from "../../../docker/application/queries/list-containers.query.js";
import { BindingStore } from "../ports/binding-store.js";
import { DeleteBindingCommand } from "./delete-binding.command.js";

/**
 * Removes the variables the binding added (exactly those) and then the binding. If the consumer no
 * longer exists there is nothing to undo. The network it joined is left alone: other things may use it.
 */
@CommandHandler(DeleteBindingCommand)
export class DeleteBindingHandler implements ICommandHandler<DeleteBindingCommand, void> {
  constructor(
    @Inject(BindingStore) private readonly store: BindingStore,
    @Inject(CommandBus) private readonly commands: CommandBus,
    @Inject(QueryBus) private readonly queries: QueryBus,
  ) {}

  async execute({ id }: DeleteBindingCommand): Promise<void> {
    const binding = await this.store.get(id);
    if (!binding) throw new NotFoundError("binding not found", "errors.notFound");
    const containers = await this.queries.execute<ListContainersQuery, Container[]>(
      new ListContainersQuery(),
    );
    const consumer = containers.find((c) => c.name === binding.consumer);
    if (consumer && binding.variables.length > 0)
      await this.commands.execute(
        new RecreateContainerCommand(consumer.id, {
          env: Object.fromEntries(binding.variables.map((v) => [v, null])),
        }),
      );
    await this.store.delete(id);
  }
}
