import { ApplyZone, PlanZoneRequest, ResourceName, type ZoneApplyResult } from "@nautix/contracts";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import { parse } from "../../../shared/zod-body.js";
import { AdminOnly } from "../../auth/presentation/admin-only.decorator.js";
import { ApplyZoneCommand } from "../application/commands/apply-zone.command.js";
import { DescribeZoneQuery } from "../application/queries/describe-zone.query.js";
import { ListZonesQuery } from "../application/queries/list-zones.query.js";
import { PlanZoneQuery } from "../application/queries/plan-zone.query.js";

/**
 * A zone as one document: read it from reality, plan the difference, apply it. The document holds
 * environment values in clear text, so everything here is for admins only.
 */
@Controller("api/v1/zones")
@AdminOnly()
export class ZoneController {
  constructor(
    @Inject(CommandBus) private readonly commands: CommandBus,
    @Inject(QueryBus) private readonly queries: QueryBus,
  ) {}

  @Get()
  list() {
    return this.queries.execute(new ListZonesQuery());
  }

  @Get(":name/spec")
  describe(@Param("name") name: string) {
    return this.queries.execute(new DescribeZoneQuery(parse(ResourceName, name)));
  }

  /** A POST only because it carries the document; it changes nothing. */
  @Post(":name/plan")
  @HttpCode(200)
  plan(@Param("name") name: string, @Body() body: unknown) {
    return this.queries.execute(
      new PlanZoneQuery(parse(ResourceName, name), parse(PlanZoneRequest, body).spec),
    );
  }

  @Post(":name/apply")
  @HttpCode(200)
  apply(@Param("name") name: string, @Body() body: unknown): Promise<ZoneApplyResult> {
    const b = parse(ApplyZone, body);
    return this.commands.execute(
      new ApplyZoneCommand(parse(ResourceName, name), b.spec, b.planHash, b.allowRemovals),
    );
  }
}
