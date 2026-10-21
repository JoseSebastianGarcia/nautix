import {
  type BindingKind,
  type BindingPlan,
  type BindingStyle,
  type Container,
  type Network,
} from "@nautix/contracts";
import { ValidationError } from "../../../shared/domain-error.js";
import { BINDING_STRATEGIES, masked, type ProviderInfo, real } from "./binding-strategies.js";

export interface PlanInput {
  consumer: Pick<Container, "name" | "networks">;
  provider: Pick<Container, "name" | "networks" | "ports">;
  providerEnv: Record<string, string>;
  networks: Pick<Network, "name" | "system">[];
  kind: BindingKind;
  name: string;
  style: BindingStyle;
}

export interface PlannedBinding {
  plan: BindingPlan;
  /** Real values (passwords included): what the consumer receives. */
  variables: Record<string, string>;
}

/** A network both can be on: a shared user-defined one if any, else the provider's first. */
export const chooseNetwork = (
  consumer: Pick<Container, "networks">,
  provider: Pick<Container, "networks">,
  networks: Pick<Network, "name" | "system">[],
): { network: string; joins: boolean } => {
  const user = new Set(networks.filter((n) => !n.system).map((n) => n.name));
  const shared = provider.networks.find((n) => user.has(n) && consumer.networks.includes(n));
  if (shared) return { network: shared, joins: false };
  const first = provider.networks.find((n) => user.has(n));
  if (!first)
    throw new ValidationError(
      "the service is only on the default network: put it on a user-defined network first",
      "errors.bindingNeedsNetwork",
    );
  return { network: first, joins: true };
};

/** Pure: which network, which variables (and a masked preview of them). */
export const planBinding = (input: PlanInput): PlannedBinding => {
  const { network, joins } = chooseNetwork(input.consumer, input.provider, input.networks);
  const info: ProviderInfo = {
    host: input.provider.name,
    env: input.providerEnv,
    port: input.provider.ports[0]?.privatePort ?? null,
  };
  const strategy = BINDING_STRATEGIES[input.kind];
  const variables = strategy.variables(info, input.name, input.style, real);
  const preview = strategy.variables(info, input.name, input.style, masked);
  return {
    variables,
    plan: {
      kind: input.kind,
      network,
      joins,
      variables: Object.keys(variables).map((key) => ({ key, preview: preview[key] ?? "" })),
      recreates: true,
    },
  };
};
