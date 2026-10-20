import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { UnauthorizedError } from "../../../../shared/domain-error.js";
import { SESSION_TTL_MS } from "../../domain/user.js";
import { PasswordHasher } from "../ports/password-hasher.js";
import { SessionRepository } from "../ports/session-repository.js";
import { hashToken, newSessionToken } from "../ports/session-tokens.js";
import { UserRepository } from "../ports/user-repository.js";
import { LoginCommand } from "./login.command.js";

/** Returns the raw session token (set once as an HttpOnly cookie, never stored). */
@CommandHandler(LoginCommand)
export class LoginHandler implements ICommandHandler<LoginCommand, string> {
  constructor(
    @Inject(UserRepository) private readonly users: UserRepository,
    @Inject(PasswordHasher) private readonly hasher: PasswordHasher,
    @Inject(SessionRepository) private readonly sessions: SessionRepository,
  ) {}

  async execute({ username, password }: LoginCommand): Promise<string> {
    const user = await this.users.findByUsername(username);
    // Verify even when the user is unknown so timing doesn't reveal which usernames exist.
    const ok = await this.hasher.verify(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok)
      throw new UnauthorizedError("invalid credentials", "errors.invalidCredentials");
    const token = newSessionToken();
    await this.sessions.add(hashToken(token), {
      userId: user.id,
      username: user.username,
      expiresAt: Date.now() + SESSION_TTL_MS,
    });
    return token;
  }
}

const DUMMY_HASH =
  "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
