import type { PluginInfo, PluginPrivilege } from "@nautix/contracts";
import { EngineHttp } from "../../../shared/engine-http.js";
import { PluginEngine } from "../application/ports/plugin-engine.js";

interface RawPlugin {
  Id: string;
  Name: string;
  Tag?: string;
  Enabled: boolean;
  Config?: { Description?: string };
}

interface RawPrivilege {
  Name: string;
  Description?: string;
  Value: string[] | null;
}

const toPrivilege = (p: RawPrivilege): PluginPrivilege => ({
  name: p.Name,
  description: p.Description ?? "",
  value: p.Value ?? [],
});

export class DockerSocketPluginEngine extends PluginEngine {
  private readonly http: EngineHttp;

  constructor(socketPath: string) {
    super();
    this.http = new EngineHttp(socketPath);
  }

  async list(): Promise<PluginInfo[]> {
    const rows = await this.http.json<RawPlugin[]>("GET", "/plugins");
    return rows.map((p) => ({
      id: p.Id,
      name: p.Name.includes(":") ? p.Name : `${p.Name}:${p.Tag ?? "latest"}`,
      enabled: p.Enabled,
      description: p.Config?.Description ?? "",
    }));
  }

  async privileges(remote: string): Promise<PluginPrivilege[]> {
    const rows = await this.http.json<RawPrivilege[]>(
      "GET",
      `/plugins/privileges?remote=${encodeURIComponent(remote)}`,
    );
    return rows.map(toPrivilege);
  }

  async install(remote: string, privileges: PluginPrivilege[]): Promise<void> {
    const body = privileges.map((p) => ({
      Name: p.name,
      Description: p.description,
      Value: p.value,
    }));
    await this.http.send(
      "POST",
      `/plugins/pull?remote=${encodeURIComponent(remote)}&name=${encodeURIComponent(remote)}`,
      body,
    );
  }

  setEnabled(name: string, enabled: boolean): Promise<void> {
    return this.http.send(
      "POST",
      `/plugins/${encodeURIComponent(name)}/${enabled ? "enable" : "disable"}`,
    );
  }

  remove(name: string, force: boolean): Promise<void> {
    return this.http.send("DELETE", `/plugins/${encodeURIComponent(name)}?force=${force}`);
  }
}
