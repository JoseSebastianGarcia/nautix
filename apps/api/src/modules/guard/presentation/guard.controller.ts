import {
  GUARD_BACKENDS,
  type GuardPlanDoc,
  GuardReport,
  type GuardStatus,
  SaveGuardRules,
} from "@nautix/contracts";
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Post,
  Put,
  Query,
  Req,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import type { Request } from "express";
import { z } from "zod";
import { UnauthorizedError } from "../../../shared/domain-error.js";
import { parse } from "../../../shared/zod-body.js";
import { Public } from "../../auth/presentation/public.decorator.js";
import { ConfirmGuardCommand } from "../application/commands/confirm-guard.command.js";
import { CreateGuardTokenCommand } from "../application/commands/create-guard-token.command.js";
import { DisableGuardCommand } from "../application/commands/disable-guard.command.js";
import { ReportGuardCommand } from "../application/commands/report-guard.command.js";
import { SaveGuardRulesCommand } from "../application/commands/save-guard-rules.command.js";
import { GetGuardPlanQuery } from "../application/queries/get-guard-plan.query.js";
import { GetGuardStatusQuery } from "../application/queries/get-guard-status.query.js";
import { PreviewGuardQuery } from "../application/queries/preview-guard.query.js";
import { VerifyGuardTokenQuery } from "../application/queries/verify-guard-token.query.js";

const Backend = z.object({ backend: z.enum(GUARD_BACKENDS).default("iptables") });

/**
 * Port guards, level 3: the rules live here, a separate privileged helper on the host enforces them.
 * The helper's two routes are public to the session guard and use their own bearer token instead.
 */
@Controller("api/v1/guard")
export class GuardController {
  constructor(
    @Inject(CommandBus) private readonly commands: CommandBus,
    @Inject(QueryBus) private readonly queries: QueryBus,
  ) {}

  @Get()
  status(): Promise<GuardStatus> {
    return this.queries.execute(new GetGuardStatusQuery());
  }

  /** Stores the rules; with a helper connected they start a 60-second trial. */
  @Put("rules")
  async save(@Body() body: unknown, @Req() req: Request) {
    const b = parse(SaveGuardRules, body);
    return this.commands.execute<SaveGuardRulesCommand, { trialUntil: string | null }>(
      new SaveGuardRulesCommand(
        b.rules,
        b.acknowledgeLockout,
        (req.ip ?? "").replace(/^::ffff:/, ""),
      ),
    );
  }

  @Post("confirm")
  @HttpCode(204)
  async confirm() {
    await this.commands.execute(new ConfirmGuardCommand());
  }

  /** Removes every rule. */
  @Delete("rules")
  @HttpCode(204)
  async disable() {
    await this.commands.execute(new DisableGuardCommand());
  }

  /** A new helper token (shown once); the previous one stops working. */
  @Post("token")
  async token() {
    return {
      token: await this.commands.execute<CreateGuardTokenCommand, string>(
        new CreateGuardTokenCommand(),
      ),
    };
  }

  /** The exact firewall commands for the current rules. */
  @Get("preview")
  preview(@Query() query: unknown) {
    return this.queries.execute(new PreviewGuardQuery(parse(Backend, query).backend));
  }

  @Public()
  @Get("helper/plan")
  async helperPlan(@Req() req: Request): Promise<GuardPlanDoc> {
    await this.assertHelper(req);
    return this.queries.execute(new GetGuardPlanQuery(true));
  }

  @Public()
  @Post("helper/report")
  @HttpCode(204)
  async helperReport(@Body() body: unknown, @Req() req: Request) {
    await this.assertHelper(req);
    await this.commands.execute(new ReportGuardCommand(parse(GuardReport, body)));
  }

  private async assertHelper(req: Request): Promise<void> {
    const token = /^Bearer (\S+)$/i.exec(req.header("authorization") ?? "")?.[1];
    const ok =
      token !== undefined &&
      (await this.queries.execute<VerifyGuardTokenQuery, boolean>(
        new VerifyGuardTokenQuery(token),
      ));
    if (!ok) throw new UnauthorizedError("invalid helper token", "errors.unauthorized");
  }
}
