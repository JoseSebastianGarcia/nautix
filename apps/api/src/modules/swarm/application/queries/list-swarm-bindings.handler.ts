import type { SwarmBinding } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { SwarmBindingStore } from "../ports/swarm-binding-store.js";
import { ListSwarmBindingsQuery } from "./list-swarm-bindings.query.js";

@QueryHandler(ListSwarmBindingsQuery)
export class ListSwarmBindingsHandler
  implements IQueryHandler<ListSwarmBindingsQuery, SwarmBinding[]>
{
  constructor(@Inject(SwarmBindingStore) private readonly store: SwarmBindingStore) {}

  execute(): Promise<SwarmBinding[]> {
    return this.store.list();
  }
}
