import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import type { Container, Session } from "@nautix/contracts";
import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import { type RawData, WebSocket, WebSocketServer } from "ws";
import { sameOrigin } from "../../../shared/request-origin.js";
import { AuditLog } from "../../audit/application/ports/audit-log.js";
import { GetSessionQuery } from "../../auth/application/queries/get-session.query.js";
import { ListContainersQuery } from "../../docker/application/queries/list-containers.query.js";
import { OpenTerminalCommand } from "../application/commands/open-terminal.command.js";
import type { TerminalChannel } from "../application/ports/terminal-engine.js";

const PATH = /^\/ws\/terminal\/([a-zA-Z0-9][a-zA-Z0-9_.-]{0,127})$/;
const SESSION_COOKIE = "nx_session";

const cookieValue = (header: string | undefined, name: string): string | undefined =>
  header
    ?.split(";")
    .map((p) => p.trim().split("="))
    .find(([k]) => k === name)?.[1];

/**
 * `/ws/terminal/:containerId` — binary frames are stdin/stdout, text frames are JSON control
 * ({"type":"resize","cols":80,"rows":24}). Session cookie and same-host Origin are required.
 */
/** Open shells at once. Nobody needs more than a handful, and each one is a process in a container. */
const MAX_SESSIONS = 10;

@Injectable()
export class TerminalGateway implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });
  private sessions = 0;

  constructor(
    @Inject(HttpAdapterHost) private readonly host: HttpAdapterHost,
    @Inject(CommandBus) private readonly commands: CommandBus,
    @Inject(QueryBus) private readonly queries: QueryBus,
    @Inject(AuditLog) private readonly audit: AuditLog,
  ) {}

  onApplicationBootstrap(): void {
    this.host.httpAdapter
      .getHttpServer()
      .on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        const match = PATH.exec(url.pathname);
        if (!match?.[1]) return; // not ours
        // Whatever goes wrong while checking a stranger's request must end that request, never the process.
        this.accept(req, socket, head, match[1], url).catch(() =>
          this.reject(socket, "400 Bad Request"),
        );
      });
  }

  onApplicationShutdown(): void {
    for (const client of this.wss.clients) client.terminate();
    this.wss.close();
  }

  private reject(socket: Duplex, status: string): void {
    if (socket.destroyed) return;
    socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
    socket.destroy();
  }

  private async accept(
    req: IncomingMessage,
    socket: Duplex,
    head: Buffer,
    containerId: string,
    url: URL,
  ): Promise<void> {
    if (socket.destroyed) return;
    const origin = req.headers.origin;
    if (!origin || !sameOrigin(origin, req.headers.host))
      return this.reject(socket, "403 Forbidden");

    const token = cookieValue(req.headers.cookie, SESSION_COOKIE);
    const session = await this.queries.execute<GetSessionQuery, Session>(
      new GetSessionQuery(token),
    );
    if (!session.authenticated) return this.reject(socket, "401 Unauthorized");
    if (session.role !== "admin") return this.reject(socket, "403 Forbidden");

    // The container running Nautix is locked: no shell inside it either.
    const containers = await this.queries.execute<ListContainersQuery, Container[]>(
      new ListContainersQuery(),
    );
    const target = containers.find((c) => c.id === containerId || c.name === containerId);
    if (target?.isSelf) return this.reject(socket, "403 Forbidden");

    if (this.sessions >= MAX_SESSIONS) return this.reject(socket, "429 Too Many Requests");

    const cols = Number(url.searchParams.get("cols") ?? 80);
    const rows = Number(url.searchParams.get("rows") ?? 24);
    let channel: TerminalChannel;
    try {
      channel = await this.commands.execute<OpenTerminalCommand, TerminalChannel>(
        new OpenTerminalCommand(containerId, cols, rows),
      );
    } catch {
      return this.reject(socket, "404 Not Found");
    }

    // Audit trail for every interactive session.
    this.audit.record({
      actor: session.username ?? "-",
      kind: "session",
      action: "terminal.open",
      status: 0,
      detail: containerId,
    });
    this.sessions += 1;
    this.wss.handleUpgrade(req, socket, head, (ws) => {
      ws.on("close", () => {
        this.sessions -= 1;
      });
      this.bridge(ws, channel, session.username ?? "", containerId);
    });
  }

  private bridge(ws: WebSocket, channel: TerminalChannel, user: string, containerId: string): void {
    channel.onData((chunk) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(chunk, { binary: true });
    });
    channel.onClose(() => ws.close(1000));
    ws.on("message", (data: RawData, isBinary: boolean) => {
      if (isBinary)
        return channel.write(Buffer.isBuffer(data) ? data : Buffer.concat(data as Buffer[]));
      try {
        const msg = JSON.parse(data.toString()) as { type?: string; cols?: number; rows?: number };
        if (msg.type === "resize" && msg.cols && msg.rows) channel.resize(msg.cols, msg.rows);
      } catch {
        /* ignore malformed control frame */
      }
    });
    ws.on("close", () => {
      channel.close();
      this.audit.record({
        actor: user,
        kind: "session",
        action: "terminal.close",
        status: 0,
        detail: containerId,
      });
    });
  }
}
