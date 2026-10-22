import { randomUUID } from "node:crypto";
import type { SwarmBinding } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { ConflictError } from "../../../../shared/domain-error.js";
import { SwarmBindingStore } from "../ports/swarm-binding-store.js";
import { SwarmEngine } from "../ports/swarm-engine.js";
import { SwarmBindingPlanner } from "../swarm-binding-planner.js";
import { CreateSwarmBindingCommand } from "./create-swarm-binding.command.js";

/**
 * Gives the consumer service the provider's connection settings and, when needed, a place on the provider's
 * overlay. That is a rolling update of the consumer (it rolls back by itself if the new copies do not start);
 * the binding is stored only after the engine accepted it.
 */
@CommandHandler(CreateSwarmBindingCommand)
export class CreateSwarmBindingHandler
  implements ICommandHandler<CreateSwarmBindingCommand, SwarmBinding>
{
  constructor(
    @Inject(SwarmBindingPlanner) private readonly planner: SwarmBindingPlanner,
    @Inject(SwarmBindingStore) private readonly store: SwarmBindingStore,
    @Inject(SwarmEngine) private readonly engine: SwarmEngine,
  ) {}

  async execute({ input }: CreateSwarmBindingCommand): Promise<SwarmBinding> {
    const planned = await this.planner.plan(input);
    const keys = Object.keys(planned.variables);
    const clash = (await this.store.list()).find(
      (b) => b.consumer === planned.consumer.name && b.variables.some((v) => keys.includes(v)),
    );
    if (clash)
      throw new ConflictError(
        "this service already has a binding with that name",
        "errors.bindingExists",
      );
    await this.engine.updateService(planned.consumer.id, {
      env: { set: planned.variables, unset: [] },
      ...(planned.plan.joins ? { networks: { add: [planned.plan.network], remove: [] } } : {}),
    });
    const binding: SwarmBinding = {
      id: randomUUID(),
      consumer: planned.consumer.name,
      provider: planned.provider.name,
      kind: planned.plan.kind,
      name: planned.plan.name,
      style: input.style,
      variables: keys,
      network: planned.plan.network,
    };
    await this.store.save(binding);
    return binding;
  }
}
