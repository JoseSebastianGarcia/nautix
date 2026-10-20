import type { EngineEvent } from "@nautix/contracts";
import { PruneKind, PruneRequest } from "@nautix/contracts";
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  type MessageEvent,
  Post,
  Query,
  Req,
  Sse,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import type { Request } from "express";
import { Observable } from "rxjs";
import { z } from "zod";
import { parse } from "../../../shared/zod-body.js";
import { PruneResourcesCommand } from "../application/commands/prune-resources.command.js";
import { GetDiskUsageQuery } from "../application/queries/get-disk-usage.query.js";
import { GetRawInfoQuery } from "../application/queries/get-raw-info.query.js";
import { GetVersionQuery } from "../application/queries/get-version.query.js";
import { PreviewPruneQuery } from "../application/queries/preview-prune.query.js";
import { WatchDetailedEventsQuery } from "../application/queries/watch-detailed-events.query.js";

const Preview = z.object({ kind: PruneKind, all: z.enum(["true", "false"]).default("false") });

/** docker info / version / system df / system prune / system events. */
@Controller("api/v1/system")
export class SystemController {
  constructor(
    @Inject(CommandBus) private readonly commands: CommandBus,
    @Inject(QueryBus) private readonly queries: QueryBus,
  ) {}

  @Get("info")
  info() {
    return this.queries.execute(new GetRawInfoQuery());
  }

  @Get("version")
  version() {
    return this.queries.execute(new GetVersionQuery());
  }

  @Get("df")
  df() {
    return this.queries.execute(new GetDiskUsageQuery());
  }

  /** Dry run: what the prune would delete. Nothing changes. */
  @Get("prune/preview")
  preview(@Query() query: unknown) {
    const q = parse(Preview, query);
    return this.queries.execute(new PreviewPruneQuery(q.kind, q.all === "true"));
  }

  @Post("prune")
  @HttpCode(200)
  prune(@Body() body: unknown) {
    const b = parse(PruneRequest, body);
    return this.commands.execute(new PruneResourcesCommand(b.kind, b.all));
  }

  /** Live engine events with details (docker events). */
  @Sse("events")
  events(@Req() req: Request): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      const abort = new AbortController();
      req.on("close", () => abort.abort());
      (async () => {
        const stream = await this.queries.execute<
          WatchDetailedEventsQuery,
          AsyncIterable<EngineEvent>
        >(new WatchDetailedEventsQuery(abort.signal));
        for await (const event of stream) subscriber.next({ data: event });
        subscriber.complete();
      })().catch((error) =>
        abort.signal.aborted ? subscriber.complete() : subscriber.error(error),
      );
      return () => abort.abort();
    });
  }
}
