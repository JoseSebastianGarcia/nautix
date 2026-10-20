import { Inject } from "@nestjs/common";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { NotFoundError } from "../../../../shared/domain-error.js";
import { type ComposeDocument, toCompose } from "../../domain/compose-export.js";
import { DockerEngine } from "../ports/docker-engine.js";
import { ExportComposeQuery } from "./export-compose.query.js";

@QueryHandler(ExportComposeQuery)
export class ExportComposeHandler implements IQueryHandler<ExportComposeQuery, ComposeDocument> {
  constructor(@Inject(DockerEngine) private readonly engine: DockerEngine) {}

  async execute({ networkId, includeEnv }: ExportComposeQuery): Promise<ComposeDocument> {
    const [allContainers, networks] = await Promise.all([
      this.engine.listContainers(),
      this.engine.listNetworks(),
    ]);
    let containers = allContainers;
    if (networkId) {
      const network = networks.find((n) => n.id === networkId);
      if (!network) throw new NotFoundError("network not found", "errors.networkNotFound");
      containers = allContainers.filter((c) => c.networks.includes(network.name));
    }
    const details = await this.engine.inspectContainers(containers.map((c) => c.id));
    return toCompose({ containers, details, networks, includeEnv });
  }
}
