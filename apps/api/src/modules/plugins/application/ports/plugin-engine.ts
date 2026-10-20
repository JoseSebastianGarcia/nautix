import type { PluginInfo, PluginPrivilege } from "@nautix/contracts";

/** Port: managed Docker plugins (volume drivers, network drivers, log drivers). */
export abstract class PluginEngine {
  abstract list(): Promise<PluginInfo[]>;
  /** The privileges `remote` asks for, without installing anything. */
  abstract privileges(remote: string): Promise<PluginPrivilege[]>;
  abstract install(remote: string, privileges: PluginPrivilege[]): Promise<void>;
  abstract setEnabled(name: string, enabled: boolean): Promise<void>;
  abstract remove(name: string, force: boolean): Promise<void>;
}
