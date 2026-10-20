import { randomUUID, timingSafeEqual } from "node:crypto";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { ConflictError, ForbiddenError } from "../../../../shared/domain-error.js";
import { PasswordHasher } from "../ports/password-hasher.js";
import { SetupTokenStore } from "../ports/setup-token-store.js";
import { UserRepository } from "../ports/user-repository.js";
import { SetupCommand } from "./setup.command.js";

const same = (a: string, b: string): boolean => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

@CommandHandler(SetupCommand)
export class SetupHandler implements ICommandHandler<SetupCommand, void> {
  constructor(
    @Inject(UserRepository) private readonly users: UserRepository,
    @Inject(PasswordHasher) private readonly hasher: PasswordHasher,
    @Inject(SetupTokenStore) private readonly setupToken: SetupTokenStore,
  ) {}

  async execute({ request }: SetupCommand): Promise<void> {
    if ((await this.users.count()) > 0) {
      throw new ConflictError("setup already completed", "errors.setupDone");
    }
    const expected = this.setupToken.current();
    if (!expected || !same(request.setupToken, expected)) {
      throw new ForbiddenError("invalid setup token", "errors.setupToken");
    }
    await this.users.add({
      id: randomUUID(),
      username: request.username,
      passwordHash: await this.hasher.hash(request.password),
      role: "admin",
    });
    this.setupToken.consume();
  }
}
