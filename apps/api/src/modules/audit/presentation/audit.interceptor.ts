import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { type Observable, tap } from "rxjs";
import { getAuditNote } from "../../../shared/audit-note.js";
import type { Principal } from "../../../shared/principal.js";
import { AuditLog } from "../application/ports/audit-log.js";

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);
/** Reads of sensitive things (environment, zone documents) are recorded once per person and thing in this time. */
const READ_QUIET_MS = 10 * 60 * 1000;
const ID = /\/(?:[0-9a-f]{12,64}|sha256:[0-9a-f]+)(?=\/|$)/g;

/** Request path with long ids folded, so the trail reads `DELETE /api/v1/containers/:id`. */
export const auditAction = (method: string, path: string): string =>
  `${method} ${path.replace(ID, "/:id")}`;

/** Records every mutating request (never bodies or query strings) with who made it and the result. */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly lastRead = new Map<string, number>();

  constructor(@Inject(AuditLog) private readonly audit: AuditLog) {}

  private repeated(key: string, now: number): boolean {
    const last = this.lastRead.get(key);
    if (last !== undefined && now - last < READ_QUIET_MS) return true;
    if (this.lastRead.size > 5000) this.lastRead.clear();
    this.lastRead.set(key, now);
    return false;
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request & { principal?: Principal }>();
    const safe = SAFE.has(req.method);
    const res = http.getResponse<Response>();
    const write = (status: number) => {
      const note = getAuditNote(req);
      if (note?.skip) return;
      if (safe) {
        // Only the reads a controller flagged as sensitive, and only when they succeeded.
        if (!note?.read || status >= 400) return;
        const who = req.principal?.name ?? "-";
        if (this.repeated(`${who}|${note.detail}`, Date.now())) return;
      }
      const body = req.body as { username?: unknown } | undefined;
      const login = req.path.endsWith("/auth/login") && typeof body?.username === "string";
      this.audit.record({
        actor: req.principal?.name ?? (login ? String(body?.username) : "-"),
        kind: req.principal?.kind ?? "anonymous",
        action: auditAction(req.method, req.path),
        status,
        detail: note?.detail ?? "",
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
