import {
  ChangeExposure,
  ConnectNetwork,
  type Container,
  ContainerAction,
  CreateContainer,
  CreateNetwork,
  CreateTunnel,
  CreateVolume,
  exposureInventory,
  KILL_SIGNALS,
  PullImage,
  SetEnv,
  SetFixedIp,
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
  Put,
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
import { AdminOnly } from "../../auth/presentation/admin-only.decorator.js";
import { ChangeExposureCommand } from "../application/commands/change-exposure.command.js";
import { ConnectNetworkCommand } from "../application/commands/connect-network.command.js";
import { ContainerActionCommand } from "../application/commands/container-action.command.js";
import { CreateContainerCommand } from "../application/commands/create-container.command.js";
import { CreateNetworkCommand } from "../application/commands/create-network.command.js";
import { CreateTunnelCommand } from "../application/commands/create-tunnel.command.js";
import { CreateVolumeCommand } from "../application/commands/create-volume.command.js";
import { DisconnectNetworkCommand } from "../application/commands/disconnect-network.command.js";
import { PullImageCommand } from "../application/commands/pull-image.command.js";
import { RemoveContainerCommand } from "../application/commands/remove-container.command.js";
import { RemoveImageCommand } from "../application/commands/remove-image.command.js";
import { RemoveNetworkCommand } from "../application/commands/remove-network.command.js";
import { RemoveVolumeCommand } from "../application/commands/remove-volume.command.js";
import { SetContainerEnvCommand } from "../application/commands/set-container-env.command.js";
import { SetFixedIpCommand } from "../application/commands/set-fixed-ip.command.js";
import type { EngineEventKind } from "../application/ports/docker-engine.js";
import { BrowseVolumeQuery } from "../application/queries/browse-volume.query.js";
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
});
const ExportQuery = z.object({
  network: z.string().optional(),
  includeEnv: z.enum(["true", "false"]).default("false"),
});
const ActionQuery = z.object({
  signal: z.enum(KILL_SIGNALS).optional(),
  timeout: z.coerce.number().int().min(0).max(600).optional(),
});
const BrowseQuery = z.object({
  path: z.string().max(1024).default("/"),
  view: z.enum(["true", "false"]).default("false"),
});

const Logs = z.object({
  tail: z.coerce.number().int().min(1).max(5000).default(200),
  since: z.coerce.number().int().min(1).max(31_536_000).optional(),
});

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
    const o = parse(ActionQuery, query);
    await this.commands.execute(
      new ContainerActionCommand(id, parse(ContainerAction, action), {
        ...(o.signal ? { signal: o.signal } : {}),
        ...(o.timeout !== undefined ? { timeoutSeconds: o.timeout } : {}),
      }),
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
    const q = parse(Logs, query);
    return { logs: await this.queries.execute(new GetContainerLogsQuery(id, q.tail, q.since)) };
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

  /** Pins the container's address on a network, or (`ip: null`) gives it back to Docker. */
  @Put("containers/:id/fixed-ip")
  @HttpCode(204)
  async fixedIp(@Param("id") id: string, @Body() body: unknown) {
    const b = parse(SetFixedIp, body);
    await this.commands.execute(new SetFixedIpCommand(id, b.network, b.ip));
  }

  /** Every published port and who can reach it, open ones first. */
  @Get("exposure")
  async exposureList() {
    const containers = await this.queries.execute<ListContainersQuery, Container[]>(
      new ListContainersQuery(),
    );
    return exposureInventory(containers);
  }

  /** Which host address each published port binds to (local only, one address, or open). */
  @Put("containers/:id/exposure")
  @HttpCode(204)
  async exposure(@Param("id") id: string, @Body() body: unknown) {
    await this.commands.execute(
      new ChangeExposureCommand(
        id,
        parse(ChangeExposure, body).ports,
        parse(ChangeExposure, body).gate,
      ),
    );
  }

  /** Edits environment variables: the container is recreated and must pass the health gate (else rolled back). */
  @Put("containers/:id/env")
  async env(@Param("id") id: string, @Body() body: unknown) {
    const b = parse(SetEnv, body);
    return this.commands.execute<SetContainerEnvCommand, { changed: string[] }>(
      new SetContainerEnvCommand(id, b.set, b.unset, b.gate),
    );
  }

  @Post("networks/:id/disconnect")
  @HttpCode(204)
  async disconnect(@Param("id") id: string, @Body() body: unknown) {
    await this.commands.execute(
      new DisconnectNetworkCommand(id, parse(ConnectNetwork, body).containerId),
    );
  }

  /** A tunnel forwards one TCP port between two networks (see domain/tunnel.ts). Delete it as a container. */
  @Post("tunnels")
  createTunnel(@Body() body: unknown) {
    return this.commands.execute(new CreateTunnelCommand(parse(CreateTunnel, body)));
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

  /** Lists a directory (or, with `view=true`, reads a file) inside a volume. Admin only: data can be sensitive. */
  @AdminOnly()
  @Get("volumes/:name/browse")
  browseVolume(@Param("name") name: string, @Query() query: unknown) {
    const q = parse(BrowseQuery, query);
    return this.queries.execute(new BrowseVolumeQuery(name, q.path, q.view === "true"));
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
