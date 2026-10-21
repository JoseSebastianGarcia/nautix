import { Controller, Get, Inject, Query } from "@nestjs/common";
import { z } from "zod";
import { parse } from "../../../shared/zod-body.js";
import { AdminOnly } from "../../auth/presentation/admin-only.decorator.js";
import { AuditLog } from "../application/ports/audit-log.js";

const Page = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  before: z.coerce.number().int().positive().optional(),
  q: z.string().trim().min(1).max(100).optional(),
});

@AdminOnly()
@Controller("api/v1/settings/audit")
export class AuditController {
  constructor(@Inject(AuditLog) private readonly audit: AuditLog) {}

  @Get()
  list(@Query() query: unknown) {
    const q = parse(Page, query);
    return this.audit.list(q.limit, q.before, q.q);
  }
}
