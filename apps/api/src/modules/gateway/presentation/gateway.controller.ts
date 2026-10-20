import {
  type Container,
  type GatewayApplyResult,
  type GatewayRoute,
  isKongImage,
  ResourceName,
  SaveGatewayRoutes,
} from "@nautix/contracts";
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import { parse } from "../../../shared/zod-body.js";
import { ApplyGatewayCommand } from "../../docker/application/commands/apply-gateway.command.js";
import { ListContainersQuery } from "../../docker/application/queries/list-containers.query.js";
import { SaveGatewayRoutesCommand } from "../application/commands/save-gateway-routes.command.js";
import { GetGatewayRoutesQuery } from "../application/queries/get-gateway-routes.query.js";

@Controller("api/v1/gateways")
export class GatewayController {
  constructor(
    @Inject(CommandBus) private readonly commands: CommandBus,
    @Inject(QueryBus) private readonly queries: QueryBus,
  ) {}

  /** Containers Nautix can configure as API gateways (Kong). */
  @Get()
  async list() {
    const containers = await this.queries.execute<ListContainersQuery, Container[]>(
      new ListContainersQuery(),
    );
    return containers
      .filter((c) => isKongImage(c.image) && c.labels["nautix.tunnel"] !== "true")
      .map((c) => ({
        id: c.id,
        name: c.name,
        image: c.image,
        state: c.state,
        networks: c.networks,
      }));
  }

  @Get(":name/routes")
  routes(@Param("name") name: string) {
    return this.queries.execute(new GetGatewayRoutesQuery(parse(ResourceName, name)));
  }

  /** Stores the mappings; they are sent to the gateway by `apply`. */
  @Put(":name/routes")
  @HttpCode(204)
  async save(@Param("name") name: string, @Body() body: unknown) {
    await this.commands.execute(
      new SaveGatewayRoutesCommand(
        parse(ResourceName, name),
        parse(SaveGatewayRoutes, body).routes,
      ),
    );
  }

  /** Re-sends the saved mappings (needed after the gateway restarts: DB-less Kong keeps them in memory only). */
  @Post(":name/apply")
  @HttpCode(200)
  async apply(@Param("name") name: string): Promise<GatewayApplyResult> {
    const gateway = parse(ResourceName, name);
    const routes = await this.queries.execute<GetGatewayRoutesQuery, GatewayRoute[]>(
      new GetGatewayRoutesQuery(gateway),
    );
    return this.commands.execute<ApplyGatewayCommand, GatewayApplyResult>(
      new ApplyGatewayCommand(gateway, routes),
    );
  }
}
