import {
  type BindingStyle,
  bindingKind,
  defaultBindingName,
  type Network,
  type SwarmBindingPlan,
  type SwarmService,
} from "@nautix/contracts";
import { Inject, Injectable } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import { NotFoundError, ValidationError } from "../../../shared/domain-error.js";
import { planBinding } from "../../bindings/domain/plan-binding.js";
import { ListNetworksQuery } from "../../docker/application/queries/list-networks.query.js";
import { SwarmEngine } from "./ports/swarm-engine.js";

export interface PlannedServiceBinding {
  plan: SwarmBindingPlan;
  /** Real values (passwords included): what the consumer receives. Never leaves the server. */
  variables: Record<string, string>;
  consumer: SwarmService;
  provider: SwarmService;
}

/** Overlay networks by name: a service lists them by id or by name, so both are resolved. */
const overlayNames = (service: SwarmService, overlays: Network[]): string[] =>
  overlays
    .filter((n) => service.networks.includes(n.id) || service.networks.includes(n.name))
    .map((n) => n.name);

/** Works out what wiring one service to another would do, reusing the strategies of container bindings. */
@Injectable()
export class SwarmBindingPlanner {
  constructor(
    @Inject(SwarmEngine) private readonly engine: SwarmEngine,
    @Inject(QueryBus) private readonly queries: QueryBus,
  ) {}

  async plan(input: {
    consumer: string;
    provider: string;
    name?: string | undefined;
    style: BindingStyle;
  }): Promise<PlannedServiceBinding> {
    if (input.consumer === input.provider)
      throw new ValidationError("a service cannot be bound to itself", "errors.bindingSelf");
    const [services, networks] = await Promise.all([
      this.engine.services(),
      this.queries.execute<ListNetworksQuery, Network[]>(new ListNetworksQuery()),
    ]);
    const find = (name: string): SwarmService => {
      const s = services.find((x) => x.name === name);
      if (!s) throw new NotFoundError("service not found", "errors.notFound");
      return s;
    };
    const consumer = find(input.consumer);
    const provider = find(input.provider);
    const overlays = networks.filter((n) => n.driver === "overlay" && !n.system);
    const kind = bindingKind(provider.image);
    const name = input.name ?? defaultBindingName(provider.name);
    const providerEnv = await this.engine.serviceEnv(provider.id);
    const port = provider.ports[0]?.target;
    const planned = planBinding({
      // The container planner only needs names, networks and the first port.
      consumer: { name: consumer.name, networks: overlayNames(consumer, overlays) },
      provider: {
        name: provider.name,
        networks: overlayNames(provider, overlays),
        ports: port ? [{ privatePort: port }] : [],
      } as never,
      providerEnv,
      networks: overlays.map((n) => ({ name: n.name, system: false })),
      kind,
      name,
      style: input.style,
    });
    return {
      consumer,
      provider,
      variables: planned.variables,
      plan: {
        kind,
        name,
        network: planned.plan.network,
        joins: planned.plan.joins,
        variables: planned.plan.variables,
      },
    };
  }
}
