import type { Binding } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { BindingStore } from "../ports/binding-store.js";
import { ListBindingsQuery } from "./list-bindings.query.js";

@QueryHandler(ListBindingsQuery)
export class ListBindingsHandler implements IQueryHandler<ListBindingsQuery, Binding[]> {
  constructor(@Inject(BindingStore) private readonly store: BindingStore) {}

  execute(): Promise<Binding[]> {
    return this.store.list();
  }
}
