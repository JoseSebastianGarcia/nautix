import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { NotFoundError, UnauthorizedError } from "../../../../shared/domain-error.js";
import { PasswordHasher } from "../ports/password-hasher.js";
import { SessionRepository } from "../ports/session-repository.js";
import { hashToken } from "../ports/session-tokens.js";
import { UserRepository } from "../ports/user-repository.js";
import { ChangePasswordCommand } from "./change-password.command.js";

/** Changing your own password needs the current one, and signs every other session out. */
@CommandHandler(ChangePasswordCommand)
export class ChangePasswordHandler implements ICommandHandler<ChangePasswordCommand, void> {
  constructor(
    @Inject(UserRepository) private readonly users: UserRepository,
    @Inject(PasswordHasher) private readonly hasher: PasswordHasher,
    @Inject(SessionRepository) private readonly sessions: SessionRepository,
  ) {}

  async execute(c: ChangePasswordCommand): Promise<void> {
    const user = await this.users.findByUsername(c.username);
    if (!user) throw new NotFoundError("user not found", "errors.notFound");
    if (!(await this.hasher.verify(c.currentPassword, user.passwordHash)))
      throw new UnauthorizedError("wrong current password", "errors.wrongCurrentPassword");
    await this.users.setPasswordHash(user.id, await this.hasher.hash(c.newPassword));
    await this.sessions.removeForUser(user.id, hashToken(c.sessionToken));
  }
}
