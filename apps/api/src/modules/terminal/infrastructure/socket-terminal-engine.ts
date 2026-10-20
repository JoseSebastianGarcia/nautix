import { type IncomingMessage, request } from "node:http";
import type { Duplex } from "node:stream";
import {
  EngineUnavailableError,
  NotFoundError,
  ValidationError,
} from "../../../shared/domain-error.js";
import { type TerminalChannel, TerminalEngine } from "../application/ports/terminal-engine.js";

const API = "/v1.43";
// Prefers bash, falls back to sh. Runs inside the container, spawned without a host shell.
const SHELL = ["/bin/sh", "-c", "command -v bash >/dev/null 2>&1 && exec bash || exec sh"];

/** `docker exec -it` over the Engine API: create an exec, then hijack the HTTP connection. */
export class SocketTerminalEngine extends TerminalEngine {
  constructor(private readonly socketPath: string) {
    super();
  }

  private json(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
      const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body));
      const req = request(
        {
          socketPath: this.socketPath,
          path: `${API}${path}`,
          method,
          headers: payload
            ? { "Content-Type": "application/json", "Content-Length": payload.length }
            : {},
        },
        (res: IncomingMessage) => {
          const chunks: Buffer[] = [];
          res.on("data", (c: Buffer) => chunks.push(c));
          res.on("end", () =>
            resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }),
          );
        },
      );
      req.on("error", () =>
        reject(new EngineUnavailableError("docker daemon unreachable", "errors.engineUnavailable")),
      );
      if (payload) req.write(payload);
      req.end();
    });
  }

  async open(containerId: string, cols: number, rows: number): Promise<TerminalChannel> {
    const created = await this.json("POST", `/containers/${encodeURIComponent(containerId)}/exec`, {
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Tty: true,
      Env: ["TERM=xterm-256color"],
      Cmd: SHELL,
    });
    if (created.status === 404) throw new NotFoundError("container not found", "errors.notFound");
    if (created.status === 409)
      throw new ValidationError("container is not running", "errors.notRunning");
    if (created.status !== 201) throw new EngineUnavailableError(`exec failed (${created.status})`);
    const execId = (JSON.parse(created.body) as { Id: string }).Id;

    const socket = await this.hijack(execId);
    const dataListeners: ((c: Buffer) => void)[] = [];
    const closeListeners: (() => void)[] = [];
    // Output that arrives before the consumer subscribes (the first prompt) is kept, not dropped.
    const early: Buffer[] = [];
    socket.on("data", (chunk: Buffer) => {
      if (dataListeners.length === 0) early.push(chunk);
      for (const l of dataListeners) l(chunk);
    });
    const closed = () => {
      for (const l of closeListeners.splice(0)) l();
    };
    socket.on("close", closed);
    socket.on("error", closed);

    const channel: TerminalChannel = {
      onData: (l) => {
        dataListeners.push(l);
        for (const chunk of early.splice(0)) l(chunk);
      },
      onClose: (l) => void closeListeners.push(l),
      write: (d) => void socket.write(d),
      resize: (c, r) =>
        void this.json("POST", `/exec/${execId}/resize?h=${r}&w=${c}`).catch(() => undefined),
      close: () => socket.destroy(),
    };
    channel.resize(cols, rows);
    return channel;
  }

  private hijack(execId: string): Promise<Duplex> {
    return new Promise((resolve, reject) => {
      const body = Buffer.from(JSON.stringify({ Detach: false, Tty: true }));
      const req = request({
        socketPath: this.socketPath,
        path: `${API}/exec/${execId}/start`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": body.length,
          Connection: "Upgrade",
          Upgrade: "tcp",
        },
      });
      req.on("upgrade", (_res, socket, head) => {
        if (head.length > 0) socket.unshift(head);
        resolve(socket);
      });
      req.on("response", (res) => {
        res.resume();
        reject(new EngineUnavailableError(`exec start refused (${res.statusCode})`));
      });
      req.on("error", () =>
        reject(new EngineUnavailableError("docker daemon unreachable", "errors.engineUnavailable")),
      );
      req.end(body);
    });
  }
}
