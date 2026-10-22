import { Inject } from "@nestjs/common";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { SwarmEngine } from "../ports/swarm-engine.js";
import { GetServiceEnvNamesQuery } from "./get-service-env-names.query.js";

/** The names of a service's environment variables, never the values. */
@QueryHandler(GetServiceEnvNamesQuery)
export class GetServiceEnvNamesHandler
  implements IQueryHandler<GetServiceEnvNamesQuery, { names: string[] }>
{
  constructor(@Inject(SwarmEngine) private readonly engine: SwarmEngine) {}

  async execute({ id }: GetServiceEnvNamesQuery): Promise<{ names: string[] }> {
    return { names: Object.keys(await this.engine.serviceEnv(id)).sort() };
  }
}
