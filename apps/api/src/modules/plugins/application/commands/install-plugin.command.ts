import type { PluginPrivilege } from "@nautix/contracts";

export class InstallPluginCommand {
  constructor(
    readonly remote: string,
    readonly privileges: PluginPrivilege[],
  ) {}
}
