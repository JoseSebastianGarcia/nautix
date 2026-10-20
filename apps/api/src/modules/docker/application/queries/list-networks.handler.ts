import type { Network } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { DockerEngine } from "../ports/docker-engine.js";
import { ListNetworksQuery } from "./list-networks.query.js";

@QueryHandler(ListNetworksQuery)
export class ListNetworksHandler implements IQueryHandler<ListNetworksQuery, Network[]> {
  constructor(@Inject(DockerEngine) private readonly engine: DockerEngine) {}

  execute(): Promise<Network[]> {
    return this.engine.listNetworks();
  }
}
