import type { RegistryInfo } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { RegistryStore } from "../ports/registry-store.js";
import { ListRegistriesQuery } from "./list-registries.query.js";

@QueryHandler(ListRegistriesQuery)
export class ListRegistriesHandler implements IQueryHandler<ListRegistriesQuery, RegistryInfo[]> {
  constructor(@Inject(RegistryStore) private readonly store: RegistryStore) {}

  async execute(): Promise<RegistryInfo[]> {
    return this.store.list();
  }
}
