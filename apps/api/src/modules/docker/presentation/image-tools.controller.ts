import { PassThrough, type Readable } from "node:stream";
import { ImageReference, PushImage, RegistryAuth, TagImage } from "@nautix/contracts";
import { Body, Controller, Get, HttpCode, Inject, Post, Query, Req, Res } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import type { Request, Response } from "express";
import { z } from "zod";
import { ValidationError } from "../../../shared/domain-error.js";
import { parse } from "../../../shared/zod-body.js";
import { AdminOnly } from "../../auth/presentation/admin-only.decorator.js";
import { ImportImageCommand } from "../application/commands/import-image.command.js";
import { LoadImageCommand } from "../application/commands/load-image.command.js";
import { PushImageCommand } from "../application/commands/push-image.command.js";
import { TagImageCommand } from "../application/commands/tag-image.command.js";
import { TestRegistryAuthCommand } from "../application/commands/test-registry-auth.command.js";
import { GetImageHistoryQuery } from "../application/queries/get-image-history.query.js";
import { SaveImageQuery } from "../application/queries/save-image.query.js";
import { SearchImagesQuery } from "../application/queries/search-images.query.js";

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024; // image archives are large; still bounded
const Ref = z.object({ ref: ImageReference });
const Refs = z.object({ ref: z.union([ImageReference, z.array(ImageReference).min(1).max(20)]) });
const Search = z.object({
  term: z.string().min(1).max(128),
  limit: z.coerce.number().int().min(1).max(50).default(25),
});
const ImportQuery = z.object({
  repository: ImageReference,
  tag: z
    .string()
    .regex(/^[\w][\w.-]{0,127}$/)
    .default("latest"),
});

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

/** docker tag / history / save / load / import / search / push, plus a stateless registry login check. */
@Controller("api/v1")
export class ImageToolsController {
  constructor(
    @Inject(CommandBus) private readonly commands: CommandBus,
    @Inject(QueryBus) private readonly queries: QueryBus,
  ) {}

  @Get("images/history")
  history(@Query() query: unknown) {
    return this.queries.execute(new GetImageHistoryQuery(parse(Ref, query).ref));
  }

  @Get("images/search")
  search(@Query() query: unknown) {
    const q = parse(Search, query);
    return this.queries.execute(new SearchImagesQuery(q.term, q.limit));
  }

  @Post("images/tag")
  @HttpCode(204)
  async tag(@Body() body: unknown) {
    const b = parse(TagImage, body);
    await this.commands.execute(new TagImageCommand(b.reference, b.repository, b.tag));
  }

  /** Image archives can contain secrets baked into layers, so saving is admin-only. */
  @AdminOnly()
  @Get("images/save")
  async save(@Query() query: unknown, @Res() res: Response) {
    const { ref } = parse(Refs, query);
    const refs = Array.isArray(ref) ? ref : [ref];
    const tar = await this.queries.execute<SaveImageQuery, Readable>(new SaveImageQuery(refs));
    res.setHeader("Content-Type", "application/x-tar");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${(refs[0] ?? "images").replace(/[^\w.-]+/g, "_")}.tar"`,
    );
    tar.pipe(res);
  }

  /** Body is a raw tar produced by `docker save`. */
  @Post("images/load")
  async load(@Req() req: Request) {
    const output = await this.commands.execute<LoadImageCommand, string>(
      new LoadImageCommand(limitBytes(req, MAX_UPLOAD_BYTES)),
    );
    return { output };
  }

  /** Body is a raw tar of a root filesystem (`docker import`). */
  @Post("images/import")
  async importTar(@Query() query: unknown, @Req() req: Request) {
    const q = parse(ImportQuery, query);
    const output = await this.commands.execute<ImportImageCommand, string>(
      new ImportImageCommand(limitBytes(req, MAX_UPLOAD_BYTES), q.repository, q.tag),
    );
    return { output };
  }

  /** Credentials in the body are forwarded once to the engine; they are never stored or logged. */
  @Post("images/push")
  async push(@Body() body: unknown) {
    const b = parse(PushImage, body);
    return {
      output: await this.commands.execute<PushImageCommand, string>(
        new PushImageCommand(b.reference, b.auth),
      ),
    };
  }

  @Post("registries/test")
  async testLogin(@Body() body: unknown) {
    return {
      status: await this.commands.execute<TestRegistryAuthCommand, string>(
        new TestRegistryAuthCommand(parse(RegistryAuth, body)),
      ),
    };
  }
}
