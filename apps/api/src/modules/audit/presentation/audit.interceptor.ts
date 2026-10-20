import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { type Observable, tap } from "rxjs";
import type { Principal } from "../../../shared/principal.js";
import { AuditLog } from "../application/ports/audit-log.js";

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);
const ID = /\/(?:[0-9a-f]{12,64}|sha256:[0-9a-f]+)(?=\/|$)/g;

/** Request path with long ids folded, so the trail reads `DELETE /api/v1/containers/:id`. */
export const auditAction = (method: string, path: string): string =>
  `${method} ${path.replace(ID, "/:id")}`;

/** Records every mutating request (never bodies or query strings) with who made it and the result. */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(@Inject(AuditLog) private readonly audit: AuditLog) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request & { principal?: Principal }>();
    if (SAFE.has(req.method)) return next.handle();
    const res = http.getResponse<Response>();
    const write = (status: number) => {
      const body = req.body as { username?: unknown } | undefined;
      const login = req.path.endsWith("/auth/login") && typeof body?.username === "string";
      this.audit.record({
        actor: req.principal?.name ?? (login ? String(body?.username) : "-"),
        kind: req.principal?.kind ?? "anonymous",
        action: auditAction(req.method, req.path),
        status,
        detail: "",
      });
    };
    return next.handle().pipe(
      tap({
        next: () => write(res.statusCode),
        error: (e: { status?: number }) => write(typeof e.status === "number" ? e.status : 500),
      }),
    );
  }
}
