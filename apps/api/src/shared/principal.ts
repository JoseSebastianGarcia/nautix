import type { Role } from "@nautix/contracts";
import type { Request } from "express";
import { ForbiddenError, UnauthorizedError } from "./domain-error.js";

/** Who is making a request: a browser session or an API token. */
export interface Principal {
  kind: "session" | "token";
  /** Username for sessions, token name for tokens. */
  name: string;
  role: Role;
}

type AuthedRequest = Request & { principal?: Principal };

export const setPrincipal = (req: Request, principal: Principal): void => {
  (req as AuthedRequest).principal = principal;
};

export const getPrincipal = (req: Request): Principal => {
  const principal = (req as AuthedRequest).principal;
  if (!principal) throw new UnauthorizedError("authentication required", "errors.unauthorized");
  return principal;
};

export const requireAdmin = (req: Request): Principal => {
  const principal = getPrincipal(req);
  if (principal.role !== "admin")
    throw new ForbiddenError("admin role required", "errors.adminOnly");
  return principal;
};
