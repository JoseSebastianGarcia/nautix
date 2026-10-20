import type { PluginInfo } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { PluginEngine } from "../ports/plugin-engine.js";
import { ListPluginsQuery } from "./list-plugins.query.js";

@QueryHandler(ListPluginsQuery)
export class ListPluginsHandler implements IQueryHandler<ListPluginsQuery, PluginInfo[]> {
  constructor(@Inject(PluginEngine) private readonly engine: PluginEngine) {}

  execute(c: ListPluginsQuery): Promise<PluginInfo[]> {
    return this.engine.list();
  }
}
