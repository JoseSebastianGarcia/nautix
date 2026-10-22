import type { SwarmBinding } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { NotFoundError } from "../../../../shared/domain-error.js";
import { SwarmBindingStore } from "../ports/swarm-binding-store.js";
import { SwarmEngine } from "../ports/swarm-engine.js";
import { DeleteSwarmBindingCommand } from "./delete-swarm-binding.command.js";

/** Takes exactly the variables the binding added out of the consumer. The overlay it joined is left alone. */
@CommandHandler(DeleteSwarmBindingCommand)
export class DeleteSwarmBindingHandler
  implements ICommandHandler<DeleteSwarmBindingCommand, SwarmBinding>
{
  constructor(
    @Inject(SwarmBindingStore) private readonly store: SwarmBindingStore,
    @Inject(SwarmEngine) private readonly engine: SwarmEngine,
  ) {}

  async execute({ id }: DeleteSwarmBindingCommand): Promise<SwarmBinding> {
    const binding = await this.store.get(id);
    if (!binding) throw new NotFoundError("binding not found", "errors.notFound");
    const consumer = (await this.engine.services()).find((s) => s.name === binding.consumer);
    // The consumer may already be gone: the record still has to go.
    if (consumer)
      await this.engine.updateService(consumer.id, { env: { set: {}, unset: binding.variables } });
    await this.store.delete(id);
    return binding;
  }
}
