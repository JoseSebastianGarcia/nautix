import {
  ComposeAction,
  ComposeProjectName,
  RunComposeAction,
  SaveComposeProject,
} from "@nautix/contracts";
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import { parse } from "../../../shared/zod-body.js";
import { DeleteComposeProjectCommand } from "../application/commands/delete-compose-project.command.js";
import { RunComposeActionCommand } from "../application/commands/run-compose-action.command.js";
import { SaveComposeProjectCommand } from "../application/commands/save-compose-project.command.js";
import { GetComposeProjectQuery } from "../application/queries/get-compose-project.query.js";
import { ListComposeProjectsQuery } from "../application/queries/list-compose-projects.query.js";

@Controller("api/v1/compose/projects")
export class ComposeController {
  constructor(
    @Inject(CommandBus) private readonly commands: CommandBus,
    @Inject(QueryBus) private readonly queries: QueryBus,
  ) {}

  @Get()
  list() {
    return this.queries.execute(new ListComposeProjectsQuery());
  }

  @Get(":name")
  get(@Param("name") name: string) {
    return this.queries.execute(new GetComposeProjectQuery(parse(ComposeProjectName, name)));
  }

  @Put(":name")
  @HttpCode(204)
  async save(@Param("name") name: string, @Body() body: unknown) {
    await this.commands.execute(
      new SaveComposeProjectCommand(
        parse(ComposeProjectName, name),
        parse(SaveComposeProject, body).content,
      ),
    );
  }

  @Delete(":name")
  @HttpCode(204)
  async remove(@Param("name") name: string) {
    await this.commands.execute(new DeleteComposeProjectCommand(parse(ComposeProjectName, name)));
  }

  /** up / down / pull / config. Runs synchronously and returns the captured output. */
  @Post(":name/:action")
  @HttpCode(200)
  run(@Param("name") name: string, @Param("action") action: string, @Body() body: unknown) {
    const options = parse(RunComposeAction, body ?? {});
    return this.commands.execute(
      new RunComposeActionCommand(
        parse(ComposeProjectName, name),
        parse(ComposeAction, action),
        options.acknowledgeRisks,
        options.removeVolumes,
      ),
    );
  }
}
