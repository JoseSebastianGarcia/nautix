import { Layout } from "@nautix/contracts";
import { Body, Controller, Get, HttpCode, Inject, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import { parse } from "../../../shared/zod-body.js";
import { SaveLayoutCommand } from "../application/commands/save-layout.command.js";
import { GetLayoutQuery } from "../application/queries/get-layout.query.js";

@Controller("api/v1/layout")
export class LayoutController {
  constructor(
    @Inject(CommandBus) private readonly commands: CommandBus,
    @Inject(QueryBus) private readonly queries: QueryBus,
  ) {}

  @Get()
  get() {
    return this.queries.execute(new GetLayoutQuery());
  }

  /** PUT is a mutation, so viewers are refused by the auth guard. */
  @Put()
  @HttpCode(204)
  async save(@Body() body: unknown) {
    await this.commands.execute(new SaveLayoutCommand(parse(Layout, body)));
  }
}
