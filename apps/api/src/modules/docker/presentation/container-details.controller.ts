import { PassThrough, type Readable } from "node:stream";
import { CommitContainer, RenameContainer, UpdateContainer } from "@nautix/contracts";
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import type { Request, Response } from "express";
import { z } from "zod";
import { envReadDetail, setAuditNote } from "../../../shared/audit-note.js";
import { ValidationError } from "../../../shared/domain-error.js";
import { getPrincipal } from "../../../shared/principal.js";
import { parse } from "../../../shared/zod-body.js";
import { AdminOnly } from "../../auth/presentation/admin-only.decorator.js";
import { CommitContainerCommand } from "../application/commands/commit-container.command.js";
import { PutArchiveCommand } from "../application/commands/put-archive.command.js";
import { RenameContainerCommand } from "../application/commands/rename-container.command.js";
import { UpdateContainerCommand } from "../application/commands/update-container.command.js";
import { WaitContainerCommand } from "../application/commands/wait-container.command.js";
import type { InspectKind } from "../application/ports/docker-engine.js";
import { ExportContainerQuery } from "../application/queries/export-container.query.js";
import { GetArchiveQuery } from "../application/queries/get-archive.query.js";
import { GetContainerDiffQuery } from "../application/queries/get-container-diff.query.js";
import { GetContainerStatsQuery } from "../application/queries/get-container-stats.query.js";
import { GetContainerTopQuery } from "../application/queries/get-container-top.query.js";
import { InspectQuery } from "../application/queries/inspect.query.js";
import { redactInspect } from "../domain/inspect-redaction.js";

const MAX_UPLOAD_BYTES = 256 * 1024 * 1024;
const ArchivePath = z.object({
  path: z
    .string()
    .min(1)
    .max(4096)
    .startsWith("/")
    .refine((p) => !p.includes("\0")),
});
const WaitQuery = z.object({ timeout: z.coerce.number().int().min(1).max(300).default(30) });
const ImageRef = z.object({ ref: z.string().min(1).max(512) });

/** Caps an upload so a client can't stream unbounded data into a container. */
const limitBytes = (source: Readable, max: number): Readable => {
  let seen = 0;
  const out = new PassThrough();
  source.on("data", (chunk: Buffer) => {
    seen += chunk.length;
    if (seen > max) {
      source.unpipe(out);
      out.destroy(new ValidationError("upload too large", "errors.uploadTooLarge"));
    }
  });
  source.on("error", (e) => out.destroy(e));
  return source.pipe(out);
};

/**
 * Per-container detail commands (docker inspect/stats/top/diff/rename/update/wait/commit/export/cp).
 * Declared before DockerController so `POST containers/:id/rename` isn't read as an action name.
 */
@Controller("api/v1")
export class ContainerDetailsController {
  constructor(
    @Inject(CommandBus) private readonly commands: CommandBus,
    @Inject(QueryBus) private readonly queries: QueryBus,
  ) {}

  private async inspect(kind: InspectKind, id: string, req: Request): Promise<unknown> {
    const raw = await this.queries.execute<InspectQuery, unknown>(new InspectQuery(kind, id));
    if (kind !== "container") return raw;
    // Environment values may hold secrets: read-only users see names only.
    if (getPrincipal(req).role !== "admin") return redactInspect(raw);
    // An admin got the values: leave a trace of whose container it was (not of the values).
    const name = (raw as { Name?: string } | null)?.Name?.replace(/^\//, "") ?? id;
    setAuditNote(req, { detail: envReadDetail(name), read: true });
    return raw;
  }

  @Get("containers/:id/inspect")
  inspectContainer(@Req() req: Request, @Param("id") id: string) {
    return this.inspect("container", id, req);
  }

  @Get("networks/:id/inspect")
  inspectNetwork(@Req() req: Request, @Param("id") id: string) {
    return this.inspect("network", id, req);
  }

  @Get("volumes/:name/inspect")
  inspectVolume(@Req() req: Request, @Param("name") name: string) {
    return this.inspect("volume", name, req);
  }

  /** Image references contain slashes, so they travel as a query parameter. */
  @Get("images/inspect")
  inspectImage(@Req() req: Request, @Query() query: unknown) {
    return this.inspect("image", parse(ImageRef, query).ref, req);
  }

  @Get("containers/:id/stats")
  stats(@Param("id") id: string) {
    return this.queries.execute(new GetContainerStatsQuery(id));
  }

  @Get("containers/:id/top")
  top(@Param("id") id: string) {
    return this.queries.execute(new GetContainerTopQuery(id));
  }

  @Get("containers/:id/diff")
  diff(@Param("id") id: string) {
    return this.queries.execute(new GetContainerDiffQuery(id));
  }

  @Post("containers/:id/rename")
  @HttpCode(204)
  async rename(@Param("id") id: string, @Body() body: unknown) {
    await this.commands.execute(new RenameContainerCommand(id, parse(RenameContainer, body).name));
  }

  @Post("containers/:id/update")
  @HttpCode(204)
  async update(@Param("id") id: string, @Body() body: unknown) {
    await this.commands.execute(new UpdateContainerCommand(id, parse(UpdateContainer, body)));
  }

  @Post("containers/:id/wait")
  @HttpCode(200)
  wait(@Param("id") id: string, @Query() query: unknown) {
    return this.commands.execute(
      new WaitContainerCommand(id, parse(WaitQuery, query).timeout * 1000),
    );
  }

  @Post("containers/:id/commit")
  commit(@Param("id") id: string, @Body() body: unknown) {
    return this.commands.execute(new CommitContainerCommand(id, parse(CommitContainer, body)));
  }

  /** The filesystem of a container can hold secrets, so exporting and copying out is admin-only. */
  @AdminOnly()
  @Get("containers/:id/export")
  async exportFilesystem(@Param("id") id: string, @Res() res: Response) {
    const tar = await this.queries.execute<ExportContainerQuery, Readable>(
      new ExportContainerQuery(id),
    );
    res.setHeader("Content-Type", "application/x-tar");
    res.setHeader("Content-Disposition", `attachment; filename="${id.slice(0, 12)}-export.tar"`);
    tar.pipe(res);
  }

  @AdminOnly()
  @Get("containers/:id/archive")
  async download(@Param("id") id: string, @Query() query: unknown, @Res() res: Response) {
    const { path } = parse(ArchivePath, query);
    const tar = await this.queries.execute<GetArchiveQuery, Readable>(
      new GetArchiveQuery(id, path),
    );
    res.setHeader("Content-Type", "application/x-tar");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${path.split("/").filter(Boolean).pop() ?? "files"}.tar"`,
    );
    tar.pipe(res);
  }

  /** Body is a raw tar stream extracted into the directory `path`. */
  @Put("containers/:id/archive")
  @HttpCode(204)
  async upload(@Param("id") id: string, @Query() query: unknown, @Req() req: Request) {
    const { path } = parse(ArchivePath, query);
    await this.commands.execute(new PutArchiveCommand(id, path, limitBytes(req, MAX_UPLOAD_BYTES)));
  }
}
