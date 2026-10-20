import { BuildContextOptions, BuildRequest } from "@nautix/contracts";
import { Body, Controller, Inject, Post, Query, Req, Res } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import type { Request, Response } from "express";
import { DomainError } from "../../../shared/domain-error.js";
import { limitBytes } from "../../../shared/limit-bytes.js";
import { parse } from "../../../shared/zod-body.js";
import { BuildContextCommand } from "../application/commands/build-context.command.js";
import { BuildImageCommand } from "../application/commands/build-image.command.js";

/** Last line of the stream, so the client knows how the build ended after the 200 was sent. */
export const BUILD_OK = "NAUTIX-BUILD: ok";
export const BUILD_FAILED = "NAUTIX-BUILD: failed";

const MAX_CONTEXT_BYTES = 512 * 1024 * 1024;

const safeJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
};

@Controller("api/v1/builds")
export class BuildController {
  constructor(@Inject(CommandBus) private readonly commands: CommandBus) {}

  /** `docker build` from a Dockerfile typed in the UI. Streams the builder output as plain text. */
  @Post()
  async build(@Body() body: unknown, @Res() res: Response): Promise<void> {
    const request = parse(BuildRequest, body);
    const lines = await this.commands.execute<BuildImageCommand, AsyncIterable<string>>(
      new BuildImageCommand(request),
    );
    await this.stream(lines, res);
  }

  /** Build from a project folder: the body is a tar, the options travel as a JSON query string. */
  @Post("context")
  async buildContext(
    @Query("options") raw: unknown,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const options = parse(BuildContextOptions, typeof raw === "string" ? safeJson(raw) : {});
    const lines = await this.commands.execute<BuildContextCommand, AsyncIterable<string>>(
      new BuildContextCommand(limitBytes(req, MAX_CONTEXT_BYTES), options),
    );
    await this.stream(lines, res);
  }

  private async stream(lines: AsyncIterable<string>, res: Response): Promise<void> {
    res.status(200);
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Accel-Buffering", "no");
    const aborted = { value: false };
    res.on("close", () => {
      aborted.value = !res.writableEnded;
    });
    try {
      for await (const line of lines) {
        if (aborted.value) return;
        res.write(`${line}\n`);
      }
      res.end(`${BUILD_OK}\n`);
    } catch (error) {
      const message = error instanceof DomainError ? error.message : "build failed";
      res.end(`ERROR: ${message}\n${BUILD_FAILED}\n`);
    }
  }
}
