import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException } from "@nestjs/common";
import type { Response } from "express";
import { ZodError } from "zod";
import { DomainError } from "./domain-error.js";

/** One filter maps every failure to application/problem+json. */
@Catch()
export class ProblemFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    let status = 500;
    let code = "internal";
    let hintKey: string | undefined;
    let detail: string | undefined;

    if (error instanceof DomainError) {
      status = error.status;
      code = error.code;
      hintKey = error.hintKey;
      detail = error.message;
    } else if (error instanceof ZodError) {
      status = 422;
      code = "validation";
      detail = error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    } else if (error instanceof HttpException) {
      status = error.getStatus();
      code = status === 404 ? "not_found" : "http_error";
      detail = error.message;
    } else {
      console.error(error instanceof Error ? error.message : "unknown error");
    }

    res
      .status(status)
      .type("application/problem+json")
      .json({
        type: `about:blank#${code}`,
        title: code,
        status,
        code,
        ...(hintKey ? { hintKey } : {}),
        ...(detail && status < 500 ? { detail } : {}),
      });
  }
}
