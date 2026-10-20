import type { PluginPrivilege } from "@nautix/contracts";

export class GetPluginPrivilegesQuery {
  constructor(readonly remote: string) {}
}
