import type { PluginPrivilege } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { PluginEngine } from "../ports/plugin-engine.js";
import { GetPluginPrivilegesQuery } from "./get-plugin-privileges.query.js";

@QueryHandler(GetPluginPrivilegesQuery)
export class GetPluginPrivilegesHandler
  implements IQueryHandler<GetPluginPrivilegesQuery, PluginPrivilege[]>
{
  constructor(@Inject(PluginEngine) private readonly engine: PluginEngine) {}

  execute(c: GetPluginPrivilegesQuery): Promise<PluginPrivilege[]> {
    return this.engine.privileges(c.remote);
  }
}
