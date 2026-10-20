import { request } from "node:http";
import {
  ConflictError,
  EngineUnavailableError,
  NotFoundError,
  ValidationError,
} from "../../../shared/domain-error.js";

export interface EngineReply {
  status: number;
  body: Buffer;
}

/** Minimal JSON client for the Docker Engine API over the unix socket. */
export class EngineHttp {
  constructor(private readonly socketPath: string) {}

  call(method: string, path: string, body?: unknown): Promise<EngineReply> {
    return new Promise((resolve, reject) => {
      const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body));
      const req = request(
        {
          socketPath: this.socketPath,
          path: `/v1.43${path}`,
          method,
          headers: payload
            ? { "Content-Type": "application/json", "Content-Length": payload.length }
            : {},
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c: Buffer) => chunks.push(c));
          res.on("end", () =>
            resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks) }),
          );
          res.on("error", reject);
        },
      );
      req.on("error", () =>
        reject(new EngineUnavailableError("docker daemon unreachable", "errors.engineUnavailable")),
      );
      if (payload) req.write(payload);
      req.end();
    });
  }

  assertOk({ status, body }: EngineReply): void {
    if (status >= 200 && status < 300) return;
    let message = `engine error ${status}`;
    try {
      message = (JSON.parse(body.toString("utf8")) as { message?: string }).message ?? message;
    } catch {
      /* keep default */
    }
    if (status === 503 || /not a swarm manager|not part of a swarm/i.test(message))
      throw new ConflictError(message, "errors.notSwarmManager");
    if (status === 404) throw new NotFoundError(message, "errors.notFound");
    if (status === 409) throw new ConflictError(message, "errors.conflict");
    if (status === 400 || status === 403)
      throw new ValidationError(message, "errors.swarmRejected");
    throw new EngineUnavailableError(message);
  }

  async json<T>(method: string, path: string, body?: unknown): Promise<T> {
    const reply = await this.call(method, path, body);
    this.assertOk(reply);
    return (reply.body.length ? JSON.parse(reply.body.toString("utf8")) : undefined) as T;
  }

  async send(method: string, path: string, body?: unknown): Promise<void> {
    this.assertOk(await this.call(method, path, body));
  }
}
