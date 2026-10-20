import type { GatewayRoute } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { GatewayRoutesRepository } from "../ports/gateway-routes-repository.js";
import { GetGatewayRoutesQuery } from "./get-gateway-routes.query.js";

@QueryHandler(GetGatewayRoutesQuery)
export class GetGatewayRoutesHandler
  implements IQueryHandler<GetGatewayRoutesQuery, GatewayRoute[]>
{
  constructor(@Inject(GatewayRoutesRepository) private readonly routes: GatewayRoutesRepository) {}

  execute({ gateway }: GetGatewayRoutesQuery): Promise<GatewayRoute[]> {
    return this.routes.get(gateway);
  }
}
