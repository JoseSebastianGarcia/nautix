import { CustomTemplateInput } from "@nautix/contracts";
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import { parse } from "../../../shared/zod-body.js";
import { DeleteCustomTemplateCommand } from "../application/commands/delete-custom-template.command.js";
import { SaveCustomTemplateCommand } from "../application/commands/save-custom-template.command.js";
import { ListCatalogQuery } from "../application/queries/list-catalog.query.js";

@Controller("api/v1/catalog")
export class CatalogController {
  constructor(
    @Inject(CommandBus) private readonly commands: CommandBus,
    @Inject(QueryBus) private readonly queries: QueryBus,
  ) {}

  @Get()
  list() {
    return this.queries.execute(new ListCatalogQuery());
  }

  /** Saves (or updates, by name) a template to reuse from the panel. */
  @Post("custom")
  save(@Body() body: unknown) {
    return this.commands.execute(new SaveCustomTemplateCommand(parse(CustomTemplateInput, body)));
  }

  @Delete("custom/:id")
  @HttpCode(204)
  async remove(@Param("id") id: string) {
    await this.commands.execute(new DeleteCustomTemplateCommand(id));
  }
}
