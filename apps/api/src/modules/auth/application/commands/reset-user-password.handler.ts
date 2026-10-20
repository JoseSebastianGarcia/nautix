import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { NotFoundError } from "../../../../shared/domain-error.js";
import { PasswordHasher } from "../ports/password-hasher.js";
import { SessionRepository } from "../ports/session-repository.js";
import { UserRepository } from "../ports/user-repository.js";
import { ResetUserPasswordCommand } from "./reset-user-password.command.js";

/** An admin sets a new password for a user; that user is signed out everywhere. */
@CommandHandler(ResetUserPasswordCommand)
export class ResetUserPasswordHandler implements ICommandHandler<ResetUserPasswordCommand, void> {
  constructor(
    @Inject(UserRepository) private readonly users: UserRepository,
    @Inject(PasswordHasher) private readonly hasher: PasswordHasher,
    @Inject(SessionRepository) private readonly sessions: SessionRepository,
  ) {}

  async execute({ id, password }: ResetUserPasswordCommand): Promise<void> {
    const user = await this.users.findById(id);
    if (!user) throw new NotFoundError("user not found", "errors.notFound");
    await this.users.setPasswordHash(id, await this.hasher.hash(password));
    await this.sessions.removeForUser(id);
  }
}
