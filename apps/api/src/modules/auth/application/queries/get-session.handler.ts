import type { Session } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { SessionRepository } from "../ports/session-repository.js";
import { hashToken } from "../ports/session-tokens.js";
import { UserRepository } from "../ports/user-repository.js";
import { GetSessionQuery } from "./get-session.query.js";

@QueryHandler(GetSessionQuery)
export class GetSessionHandler implements IQueryHandler<GetSessionQuery, Session> {
  constructor(
    @Inject(SessionRepository) private readonly sessions: SessionRepository,
    @Inject(UserRepository) private readonly users: UserRepository,
  ) {}

  async execute({ token }: GetSessionQuery): Promise<Session> {
    const setupRequired = (await this.users.count()) === 0;
    const stored = token ? await this.sessions.find(hashToken(token)) : null;
    if (stored && stored.expiresAt > Date.now()) {
      return { authenticated: true, setupRequired, username: stored.username };
    }
    return { authenticated: false, setupRequired, username: null };
  }
}
