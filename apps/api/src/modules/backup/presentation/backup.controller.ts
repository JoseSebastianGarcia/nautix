import {
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
  Post,
  Req,
  StreamableFile,
} from "@nestjs/common";
import type { Request } from "express";
import { ValidationError } from "../../../shared/domain-error.js";
import { requireAdmin } from "../../../shared/principal.js";
import { AuditLog } from "../../audit/application/ports/audit-log.js";
import { AdminOnly } from "../../auth/presentation/admin-only.decorator.js";
import { BackupService, Restarter } from "../application/ports/backup-service.js";
import { MAX_RESTORED_BYTES } from "../domain/backup-archive.js";

const readBody = async (req: Request, max: number): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > max) throw new ValidationError("upload too large", "errors.uploadTooLarge");
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
};

@AdminOnly()
@Controller("api/v1/settings")
export class BackupController {
  constructor(
    @Inject(BackupService) private readonly backups: BackupService,
    @Inject(Restarter) private readonly restarter: Restarter,
    @Inject(AuditLog) private readonly audit: AuditLog,
  ) {}

  /** Database, encryption key and certificates. It holds secrets: treat the file like a password. */
  @Get("backup")
  @Header("Content-Type", "application/gzip")
  @Header("Cache-Control", "no-store")
  async download(@Req() req: Request) {
    const principal = requireAdmin(req);
    const data = await this.backups.create();
    this.audit.record({
      actor: principal.name,
      kind: principal.kind,
      action: "backup.download",
      status: 200,
      detail: "",
    });
    const stamp = new Date().toISOString().slice(0, 10);
    return new StreamableFile(data, {
      disposition: `attachment; filename="nautix-backup-${stamp}.nbk"`,
    });
  }

  /** Raw body = the file from `GET /backup`. Applied on the next start, which this triggers. */
  @Post("restore")
  @HttpCode(202)
  async restore(@Req() req: Request) {
    const principal = requireAdmin(req);
    const summary = await this.backups.stageRestore(await readBody(req, MAX_RESTORED_BYTES));
    this.audit.record({
      actor: principal.name,
      kind: principal.kind,
      action: "backup.restore",
      status: 202,
      detail: summary.files.join(","),
    });
    this.restarter.restartSoon();
    return { restarting: true };
  }
}
