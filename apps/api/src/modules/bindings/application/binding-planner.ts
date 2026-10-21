import {
  type Binding,
  type BindingStyle,
  bindingKind,
  defaultBindingName,
  type Container,
  type Network,
} from "@nautix/contracts";
import { Inject, Injectable } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import { NotFoundError, ValidationError } from "../../../shared/domain-error.js";
import { InspectQuery } from "../../docker/application/queries/inspect.query.js";
import { ListContainersQuery } from "../../docker/application/queries/list-containers.query.js";
import { ListNetworksQuery } from "../../docker/application/queries/list-networks.query.js";
import { type PlannedBinding, planBinding } from "../domain/plan-binding.js";

export interface Planned extends PlannedBinding {
  consumer: Container;
  provider: Container;
  kind: Binding["kind"];
  name: string;
}

const envOf = (raw: unknown): Record<string, string> => {
  const list = (raw as { Config?: { Env?: string[] | null } }).Config?.Env ?? [];
  return Object.fromEntries(
    list.map((line) => {
      const i = line.indexOf("=");
      return i < 0 ? [line, ""] : [line.slice(0, i), line.slice(i + 1)];
    }),
  );
};

/** Looks at the live containers and networks and works out what a binding would do. */
@Injectable()
export class BindingPlanner {
  constructor(@Inject(QueryBus) private readonly queries: QueryBus) {}

  async plan(input: {
    consumer: string;
    provider: string;
    name?: string | undefined;
    style: BindingStyle;
  }): Promise<Planned> {
    if (input.consumer === input.provider)
      throw new ValidationError("a container cannot be bound to itself", "errors.bindingSelf");
    const [containers, networks] = await Promise.all([
      this.queries.execute<ListContainersQuery, Container[]>(new ListContainersQuery()),
      this.queries.execute<ListNetworksQuery, Network[]>(new ListNetworksQuery()),
    ]);
    const find = (name: string): Container => {
      const c = containers.find((x) => x.name === name);
      if (!c) throw new NotFoundError("container not found", "errors.notFound");
      return c;
    };
    const consumer = find(input.consumer);
    const provider = find(input.provider);
    if (consumer.isSelf || provider.isSelf)
      throw new ValidationError("Nautix itself cannot be bound", "errors.selfLocked");
    const kind = bindingKind(provider.image);
    const name = input.name ?? defaultBindingName(provider.name);
    const providerEnv = envOf(
      await this.queries.execute<InspectQuery, unknown>(new InspectQuery("container", provider.id)),
    );
    const planned = planBinding({
      consumer,
      provider,
      providerEnv,
      networks,
      kind,
      name,
      style: input.style,
    });
    return { ...planned, consumer, provider, kind, name };
  }
}
