import { CreateToken, CreateUser, ResetPassword } from "@nautix/contracts";
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Req,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import type { Request } from "express";
import { requireAdmin } from "../../../shared/principal.js";
import { parse } from "../../../shared/zod-body.js";
import { CreateApiTokenCommand } from "../application/commands/create-api-token.command.js";
import { CreateUserCommand } from "../application/commands/create-user.command.js";
import { DeleteUserCommand } from "../application/commands/delete-user.command.js";
import { ResetUserPasswordCommand } from "../application/commands/reset-user-password.command.js";
import { RevokeApiTokenCommand } from "../application/commands/revoke-api-token.command.js";
import { ListApiTokensQuery } from "../application/queries/list-api-tokens.query.js";
import { ListUsersQuery } from "../application/queries/list-users.query.js";
import { AdminOnly } from "./admin-only.decorator.js";

@AdminOnly()
@Controller("api/v1/settings")
export class SettingsController {
  constructor(
    @Inject(CommandBus) private readonly commands: CommandBus,
    @Inject(QueryBus) private readonly queries: QueryBus,
  ) {}

  @Get("users")
  users() {
    return this.queries.execute(new ListUsersQuery());
  }

  @Post("users")
  createUser(@Body() body: unknown) {
    return this.commands.execute(new CreateUserCommand(parse(CreateUser, body)));
  }

  @Put("users/:id/password")
  @HttpCode(204)
  async resetPassword(@Param("id") id: string, @Body() body: unknown) {
    await this.commands.execute(
      new ResetUserPasswordCommand(id, parse(ResetPassword, body).password),
    );
  }

  @Delete("users/:id")
  @HttpCode(204)
  async deleteUser(@Req() req: Request, @Param("id") id: string) {
    await this.commands.execute(new DeleteUserCommand(id, requireAdmin(req).name));
  }

  @Get("tokens")
  tokens() {
    return this.queries.execute(new ListApiTokensQuery());
  }

  /** Response carries the raw token exactly once. */
  @Post("tokens")
  createToken(@Body() body: unknown) {
    return this.commands.execute(new CreateApiTokenCommand(parse(CreateToken, body)));
  }

  @Delete("tokens/:id")
  @HttpCode(204)
  async revokeToken(@Param("id") id: string) {
    await this.commands.execute(new RevokeApiTokenCommand(id));
  }
}
