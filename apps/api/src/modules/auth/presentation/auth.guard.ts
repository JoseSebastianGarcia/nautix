import type { Session } from "@nautix/contracts";
import { type CanActivate, type ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { QueryBus } from "@nestjs/cqrs";
import type { Request } from "express";
import { ForbiddenError, UnauthorizedError } from "../../../shared/domain-error.js";
import { GetSessionQuery } from "../application/queries/get-session.query.js";
import { IS_PUBLIC } from "./public.decorator.js";

export const SESSION_COOKIE = "nx_session";
const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Auth is always on. Mutations also need the custom CSRF header (a cross-site form
 * can't set it) and, when the browser sends one, a same-host Origin.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(QueryBus) private readonly queries: QueryBus,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();

    if (!SAFE.has(req.method)) {
      if (req.header("x-nautix-csrf") !== "1")
        throw new ForbiddenError("csrf header missing", "errors.csrf");
      const origin = req.header("origin");
      if (origin && new URL(origin).host !== req.header("host")) {
        throw new ForbiddenError("cross-origin request", "errors.csrf");
      }
    }

    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return true;
    }
    const token = (req.cookies as Record<string, string | undefined>)[SESSION_COOKIE];
    const session = await this.queries.execute<GetSessionQuery, Session>(
      new GetSessionQuery(token),
    );
    if (!session.authenticated)
      throw new UnauthorizedError("authentication required", "errors.unauthorized");
    return true;
  }
}
