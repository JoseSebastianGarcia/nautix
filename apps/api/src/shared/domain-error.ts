/** Base for every error the API maps to application/problem+json. */
export abstract class DomainError extends Error {
  abstract readonly status: number;
  abstract readonly code: string;
  /** i18n key the web translates; the server never sends localized text. */
  readonly hintKey?: string;

  constructor(message: string, hintKey?: string) {
    super(message);
    this.name = new.target.name;
    if (hintKey) this.hintKey = hintKey;
  }
}

export class NotFoundError extends DomainError {
  readonly status = 404;
  readonly code = "not_found";
}

export class ConflictError extends DomainError {
  readonly status = 409;
  readonly code = "conflict";
}

export class ValidationError extends DomainError {
  readonly status = 422;
  readonly code = "validation";
}

export class UnauthorizedError extends DomainError {
  readonly status = 401;
  readonly code = "unauthorized";
}

export class ForbiddenError extends DomainError {
  readonly status = 403;
  readonly code = "forbidden";
}

export class TooManyRequestsError extends DomainError {
  readonly status = 429;
  readonly code = "rate_limited";
}

export class EngineUnavailableError extends DomainError {
  readonly status = 503;
  readonly code = "engine_unavailable";
}
