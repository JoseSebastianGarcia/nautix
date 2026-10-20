import type { Session } from "@nautix/contracts";
import { type CanActivate, type ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { QueryBus } from "@nestjs/cqrs";
import type { Request } from "express";
import { ForbiddenError, UnauthorizedError } from "../../../shared/domain-error.js";
import { type Principal, setPrincipal } from "../../../shared/principal.js";
import { AuthenticateTokenQuery } from "../application/queries/authenticate-token.query.js";
import { GetSessionQuery } from "../application/queries/get-session.query.js";
import { ADMIN_ONLY } from "./admin-only.decorator.js";
import { IS_PUBLIC } from "./public.decorator.js";
import { SELF_SERVICE } from "./self-service.decorator.js";

export const SESSION_COOKIE = "nx_session";
const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Auth is always on. Two ways in: the session cookie (browser) or `Authorization: Bearer nx_…`
 * (API token). Cookie mutations also need the custom CSRF header and a same-host Origin; bearer
 * requests can't be forged cross-site, so they skip that. Viewers are read-only.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(QueryBus) private readonly queries: QueryBus,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const bearer = /^Bearer (\S+)$/i.exec(req.header("authorization") ?? "")?.[1];

    if (!SAFE.has(req.method) && !bearer) {
      if (req.header("x-nautix-csrf") !== "1")
        throw new ForbiddenError("csrf header missing", "errors.csrf");
      const origin = req.header("origin");
      if (origin && new URL(origin).host !== req.header("host")) {
        throw new ForbiddenError("cross-origin request", "errors.csrf");
      }
    }

    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const principal = bearer ? await this.fromToken(bearer) : await this.fromCookie(req);
    if (!principal) throw new UnauthorizedError("authentication required", "errors.unauthorized");
    setPrincipal(req, principal);

    const adminOnly = this.reflector.getAllAndOverride<boolean>(ADMIN_ONLY, targets);
    const selfService = this.reflector.getAllAndOverride<boolean>(SELF_SERVICE, targets);
    if ((!SAFE.has(req.method) || adminOnly) && principal.role !== "admin" && !selfService) {
      throw new ForbiddenError("this role is read-only", "errors.readOnly");
    }
    return true;
  }

  private fromToken(raw: string): Promise<Principal | null> {
    return this.queries.execute<AuthenticateTokenQuery, Principal | null>(
      new AuthenticateTokenQuery(raw),
    );
  }

  private async fromCookie(req: Request): Promise<Principal | null> {
    const token = (req.cookies as Record<string, string | undefined>)[SESSION_COOKIE];
    const session = await this.queries.execute<GetSessionQuery, Session>(
      new GetSessionQuery(token),
    );
    return session.authenticated && session.username && session.role
      ? { kind: "session", name: session.username, role: session.role }
      : null;
  }
}
