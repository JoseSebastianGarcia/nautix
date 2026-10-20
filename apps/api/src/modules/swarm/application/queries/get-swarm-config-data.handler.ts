import { Inject } from "@nestjs/common";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { SwarmEngine } from "../ports/swarm-engine.js";
import { GetSwarmConfigDataQuery } from "./get-swarm-config-data.query.js";

@QueryHandler(GetSwarmConfigDataQuery)
export class GetSwarmConfigDataHandler implements IQueryHandler<GetSwarmConfigDataQuery, string> {
  constructor(@Inject(SwarmEngine) private readonly engine: SwarmEngine) {}

  execute(c: GetSwarmConfigDataQuery): Promise<string> {
    return this.engine.configData(c.id);
  }
}
