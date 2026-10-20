import type { PluginInfo, PluginPrivilege } from "@nautix/contracts";
import { ConflictError, NotFoundError, ValidationError } from "../../../shared/domain-error.js";
import { PluginEngine } from "../application/ports/plugin-engine.js";

const ASKS: PluginPrivilege[] = [
  { name: "network", description: "", value: ["host"] },
  { name: "mount", description: "", value: ["/var/lib/docker/plugins/"] },
];

/** In-memory plugins for the demo engine and tests. */
export class FakePluginEngine extends PluginEngine {
  private readonly plugins = new Map<string, PluginInfo>();

  async list(): Promise<PluginInfo[]> {
    return [...this.plugins.values()];
  }

  async privileges(): Promise<PluginPrivilege[]> {
    return ASKS;
  }

  async install(remote: string, privileges: PluginPrivilege[]): Promise<void> {
    if (
      JSON.stringify(privileges.map((p) => [p.name, p.value])) !==
      JSON.stringify(ASKS.map((p) => [p.name, p.value]))
    )
      throw new ValidationError("privileges do not match", "errors.pluginPrivileges");
    const name = remote.includes(":") ? remote : `${remote}:latest`;
    if (this.plugins.has(name))
      throw new ConflictError("plugin already installed", "errors.conflict");
    this.plugins.set(name, { id: name, name, enabled: false, description: "demo plugin" });
  }

  private plugin(name: string): PluginInfo {
    const p = this.plugins.get(name);
    if (!p) throw new NotFoundError("plugin not found", "errors.notFound");
    return p;
  }

  async setEnabled(name: string, enabled: boolean): Promise<void> {
    this.plugin(name).enabled = enabled;
  }

  async remove(name: string, force: boolean): Promise<void> {
    const p = this.plugin(name);
    if (p.enabled && !force) throw new ConflictError("plugin is enabled", "errors.conflict");
    this.plugins.delete(name);
  }
}
