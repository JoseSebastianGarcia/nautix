import { randomUUID } from "node:crypto";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { ConflictError } from "../../../../shared/domain-error.js";
import { PasswordHasher } from "../ports/password-hasher.js";
import { UserRepository } from "../ports/user-repository.js";
import { CreateUserCommand } from "./create-user.command.js";

@CommandHandler(CreateUserCommand)
export class CreateUserHandler implements ICommandHandler<CreateUserCommand, { id: string }> {
  constructor(
    @Inject(UserRepository) private readonly users: UserRepository,
    @Inject(PasswordHasher) private readonly hasher: PasswordHasher,
  ) {}

  async execute({ request }: CreateUserCommand): Promise<{ id: string }> {
    if (await this.users.findByUsername(request.username)) {
      throw new ConflictError("username already exists", "errors.usernameTaken");
    }
    const id = randomUUID();
    await this.users.add({
      id,
      username: request.username,
      passwordHash: await this.hasher.hash(request.password),
      role: request.role,
    });
    return { id };
  }
}
