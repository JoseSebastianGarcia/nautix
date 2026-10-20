import { LoginRequest, type Session, SetupRequest } from "@nautix/contracts";
import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import type { Request, Response } from "express";
import { APP_CONFIG, type AppConfig } from "../../../shared/config.js";
import { parse } from "../../../shared/zod-body.js";
import { LoginCommand } from "../application/commands/login.command.js";
import { LogoutCommand } from "../application/commands/logout.command.js";
import { SetupCommand } from "../application/commands/setup.command.js";
import { GetSessionQuery } from "../application/queries/get-session.query.js";
import { SESSION_TTL_MS } from "../domain/user.js";
import { SESSION_COOKIE } from "./auth.guard.js";
import { LoginRateLimiter } from "./login-rate-limiter.js";
import { Public } from "./public.decorator.js";

@Controller("api/v1/auth")
export class AuthController {
  private readonly limiter = new LoginRateLimiter();

  constructor(
    @Inject(CommandBus) private readonly commands: CommandBus,
    @Inject(QueryBus) private readonly queries: QueryBus,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Public()
  @Get("session")
  session(@Req() req: Request): Promise<Session> {
    const token = (req.cookies as Record<string, string | undefined>)[SESSION_COOKIE];
    return this.queries.execute(new GetSessionQuery(token));
  }

  @Public()
  @Post("setup")
  @HttpCode(204)
  async setup(@Req() req: Request, @Body() body: unknown): Promise<void> {
    this.limiter.check(`setup:${req.ip}`);
    await this.commands.execute(new SetupCommand(parse(SetupRequest, body)));
  }

  @Public()
  @Post("login")
  @HttpCode(204)
  async login(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() body: unknown,
  ): Promise<void> {
    this.limiter.check(`login:${req.ip}`);
    const { username, password } = parse(LoginRequest, body);
    const token = await this.commands.execute<LoginCommand, string>(
      new LoginCommand(username, password),
    );
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "strict",
      secure: this.config.secureCookies,
      maxAge: SESSION_TTL_MS,
      path: "/",
    });
  }

  @Public()
  @Post("logout")
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const token = (req.cookies as Record<string, string | undefined>)[SESSION_COOKIE];
    if (token) await this.commands.execute(new LogoutCommand(token));
    res.clearCookie(SESSION_COOKIE, { path: "/" });
  }
}
