import type { SwarmCluster } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { SwarmEngine } from "../ports/swarm-engine.js";
import { GetSwarmClusterQuery } from "./get-swarm-cluster.query.js";

/**
 * The whole cluster in one read: status, nodes, services and every task. Only a manager can list
 * these, so any other engine (no swarm, a worker, a locked swarm) gets its status and empty lists: the
 * web explains why instead of failing.
 */
@QueryHandler(GetSwarmClusterQuery)
export class GetSwarmClusterHandler implements IQueryHandler<GetSwarmClusterQuery, SwarmCluster> {
  constructor(@Inject(SwarmEngine) private readonly engine: SwarmEngine) {}

  async execute(_: GetSwarmClusterQuery): Promise<SwarmCluster> {
    const status = await this.engine.status();
    if (!status.active || !status.isManager || status.locked)
      return { status, nodes: [], services: [], tasks: [] };
    const [nodes, services, tasks] = await Promise.all([
      this.engine.nodes(),
      this.engine.services(),
      this.engine.allTasks(),
    ]);
    return { status, nodes, services, tasks };
  }
}
