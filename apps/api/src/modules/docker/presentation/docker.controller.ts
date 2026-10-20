import {
  ConnectNetwork,
  ContainerAction,
  CreateContainer,
  CreateNetwork,
  CreateVolume,
  PullImage,
  TEMPLATES,
} from "@nautix/contracts";
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  type MessageEvent,
  Param,
  Post,
  Query,
  Req,
  Sse,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import type { Request } from "express";
import { Observable } from "rxjs";
import { stringify } from "yaml";
import { z } from "zod";
import { requireAdmin } from "../../../shared/principal.js";
import { parse } from "../../../shared/zod-body.js";
import { ConnectNetworkCommand } from "../application/commands/connect-network.command.js";
import { ContainerActionCommand } from "../application/commands/container-action.command.js";
import { CreateContainerCommand } from "../application/commands/create-container.command.js";
import { CreateNetworkCommand } from "../application/commands/create-network.command.js";
import { CreateVolumeCommand } from "../application/commands/create-volume.command.js";
import { DisconnectNetworkCommand } from "../application/commands/disconnect-network.command.js";
import { PullImageCommand } from "../application/commands/pull-image.command.js";
import { RemoveContainerCommand } from "../application/commands/remove-container.command.js";
import { RemoveImageCommand } from "../application/commands/remove-image.command.js";
import { RemoveNetworkCommand } from "../application/commands/remove-network.command.js";
import { RemoveVolumeCommand } from "../application/commands/remove-volume.command.js";
import type { EngineEventKind } from "../application/ports/docker-engine.js";
import { ExportComposeQuery } from "../application/queries/export-compose.query.js";
import { GetContainerLogsQuery } from "../application/queries/get-container-logs.query.js";
import { GetEngineInfoQuery } from "../application/queries/get-engine-info.query.js";
import { ListContainersQuery } from "../application/queries/list-containers.query.js";
import { ListImagesQuery } from "../application/queries/list-images.query.js";
import { ListNetworksQuery } from "../application/queries/list-networks.query.js";
import { ListVolumesQuery } from "../application/queries/list-volumes.query.js";
import { WatchEventsQuery } from "../application/queries/watch-events.query.js";
import type { ComposeDocument } from "../domain/compose-export.js";

const Force = z.object({
  force: z.enum(["true", "false"]).default("false"),
  confirm: z.string().optional(),
});
const Confirm = z.object({ confirm: z.string().optional() });
const ExportQuery = z.object({
  network: z.string().optional(),
  includeEnv: z.enum(["true", "false"]).default("false"),
});
const Logs = z.object({ tail: z.coerce.number().int().min(1).max(5000).default(200) });

@Controller("api/v1")
export class DockerController {
  constructor(
    @Inject(CommandBus) private readonly commands: CommandBus,
    @Inject(QueryBus) private readonly queries: QueryBus,
  ) {}

  @Get("engine")
  engine() {
    return this.queries.execute(new GetEngineInfoQuery());
  }

  /** Server-sent events: each message says only *what kind* of resource changed; clients refetch. */
  @Sse("events")
  events(@Req() req: Request): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      const abort = new AbortController();
      req.on("close", () => abort.abort());
      (async () => {
        const stream = await this.queries.execute<WatchEventsQuery, AsyncIterable<EngineEventKind>>(
          new WatchEventsQuery(abort.signal),
        );
        for await (const kind of stream) subscriber.next({ data: { kind } });
        subscriber.complete();
      })().catch((error) =>
        abort.signal.aborted ? subscriber.complete() : subscriber.error(error),
      );
      return () => abort.abort();
    });
  }

  @Get("export/compose")
  async exportCompose(@Req() req: Request, @Query() query: unknown) {
    const { network, includeEnv } = parse(ExportQuery, query);
    // Env values may hold secrets: viewers never get them.
    if (includeEnv === "true") requireAdmin(req);
    const doc = await this.queries.execute<ExportComposeQuery, ComposeDocument>(
      new ExportComposeQuery(network, includeEnv === "true"),
    );
    return { yaml: stringify(doc, { lineWidth: 0 }) };
  }

  @Get("catalog")
  catalog() {
    return TEMPLATES;
  }

  @Get("containers")
  containers() {
    return this.queries.execute(new ListContainersQuery());
  }

  @Post("containers")
  create(@Body() body: unknown) {
    return this.commands.execute(new CreateContainerCommand(parse(CreateContainer, body)));
  }

  @Post("containers/:id/:action")
  @HttpCode(204)
  async action(@Param("id") id: string, @Param("action") action: string, @Query() query: unknown) {
    await this.commands.execute(
      new ContainerActionCommand(id, parse(ContainerAction, action), parse(Confirm, query).confirm),
    );
  }

  @Delete("containers/:id")
  @HttpCode(204)
  async removeContainer(@Param("id") id: string, @Query() query: unknown) {
    await this.commands.execute(
      new RemoveContainerCommand(id, parse(Force, query).force === "true"),
    );
  }

  @Get("containers/:id/logs")
  async logs(@Param("id") id: string, @Query() query: unknown) {
    return {
      logs: await this.queries.execute(new GetContainerLogsQuery(id, parse(Logs, query).tail)),
    };
  }

  @Get("networks")
  networks() {
    return this.queries.execute(new ListNetworksQuery());
  }

  @Post("networks")
  createNetwork(@Body() body: unknown) {
    return this.commands.execute(new CreateNetworkCommand(parse(CreateNetwork, body)));
  }

  @Delete("networks/:id")
  @HttpCode(204)
  async removeNetwork(@Param("id") id: string) {
    await this.commands.execute(new RemoveNetworkCommand(id));
  }

  @Post("networks/:id/connect")
  @HttpCode(204)
  async connect(@Param("id") id: string, @Body() body: unknown) {
    await this.commands.execute(
      new ConnectNetworkCommand(id, parse(ConnectNetwork, body).containerId),
    );
  }

  @Post("networks/:id/disconnect")
  @HttpCode(204)
  async disconnect(@Param("id") id: string, @Body() body: unknown) {
    await this.commands.execute(
      new DisconnectNetworkCommand(id, parse(ConnectNetwork, body).containerId),
    );
  }

  @Get("images")
  images() {
    return this.queries.execute(new ListImagesQuery());
  }

  @Post("images/pull")
  @HttpCode(204)
  async pull(@Body() body: unknown) {
    await this.commands.execute(new PullImageCommand(parse(PullImage, body).reference));
  }

  @Delete("images/:id")
  @HttpCode(204)
  async removeImage(@Param("id") id: string, @Query() query: unknown) {
    await this.commands.execute(new RemoveImageCommand(id, parse(Force, query).force === "true"));
  }

  @Get("volumes")
  volumes() {
    return this.queries.execute(new ListVolumesQuery());
  }

  @Post("volumes")
  @HttpCode(204)
  async createVolume(@Body() body: unknown) {
    await this.commands.execute(new CreateVolumeCommand(parse(CreateVolume, body).name));
  }

  @Delete("volumes/:name")
  @HttpCode(204)
  async removeVolume(@Param("name") name: string) {
    await this.commands.execute(new RemoveVolumeCommand(name));
  }
}
