import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { SessionRepository } from "../ports/session-repository.js";
import { hashToken } from "../ports/session-tokens.js";
import { LogoutCommand } from "./logout.command.js";

@CommandHandler(LogoutCommand)
export class LogoutHandler implements ICommandHandler<LogoutCommand, void> {
  constructor(@Inject(SessionRepository) private readonly sessions: SessionRepository) {}

  execute({ token }: LogoutCommand): Promise<void> {
    return this.sessions.remove(hashToken(token));
  }
}
