import { InstallPlugin } from "@nautix/contracts";
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import { z } from "zod";
import { parse } from "../../../shared/zod-body.js";
import { AdminOnly } from "../../auth/presentation/admin-only.decorator.js";
import { InstallPluginCommand } from "../application/commands/install-plugin.command.js";
import { RemovePluginCommand } from "../application/commands/remove-plugin.command.js";
import { SetPluginEnabledCommand } from "../application/commands/set-plugin-enabled.command.js";
import { GetPluginPrivilegesQuery } from "../application/queries/get-plugin-privileges.query.js";
import { ListPluginsQuery } from "../application/queries/list-plugins.query.js";

const Remote = z.object({ remote: InstallPlugin.shape.remote });
const Force = z.object({ force: z.enum(["true", "false"]).default("false") });
const PluginName = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_.:/@-]*$/);

/** docker plugin ls / install / enable / disable / rm. Plugins run with host privileges: admin only. */
@AdminOnly()
@Controller("api/v1/plugins")
export class PluginsController {
  constructor(
    @Inject(CommandBus) private readonly commands: CommandBus,
    @Inject(QueryBus) private readonly queries: QueryBus,
  ) {}

  @Get()
  list() {
    return this.queries.execute(new ListPluginsQuery());
  }

  @Get("privileges")
  privileges(@Query() query: unknown) {
    return this.queries.execute(new GetPluginPrivilegesQuery(parse(Remote, query).remote));
  }

  @Post()
  @HttpCode(204)
  async install(@Body() body: unknown) {
    const b = parse(InstallPlugin, body);
    await this.commands.execute(new InstallPluginCommand(b.remote, b.privileges));
  }

  @Post(":name/enable")
  @HttpCode(204)
  async enable(@Param("name") name: string) {
    await this.commands.execute(new SetPluginEnabledCommand(parse(PluginName, name), true));
  }

  @Post(":name/disable")
  @HttpCode(204)
  async disable(@Param("name") name: string) {
    await this.commands.execute(new SetPluginEnabledCommand(parse(PluginName, name), false));
  }

  @Delete(":name")
  @HttpCode(204)
  async remove(@Param("name") name: string, @Query() query: unknown) {
    await this.commands.execute(
      new RemovePluginCommand(parse(PluginName, name), parse(Force, query).force === "true"),
    );
  }
}
