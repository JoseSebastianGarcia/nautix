import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { ConflictError, NotFoundError } from "../../../../shared/domain-error.js";
import { UserRepository } from "../ports/user-repository.js";
import { DeleteUserCommand } from "./delete-user.command.js";

@CommandHandler(DeleteUserCommand)
export class DeleteUserHandler implements ICommandHandler<DeleteUserCommand, void> {
  constructor(@Inject(UserRepository) private readonly users: UserRepository) {}

  async execute({ id, actor }: DeleteUserCommand): Promise<void> {
    const user = await this.users.findById(id);
    if (!user) throw new NotFoundError("user not found", "errors.notFound");
    if (user.username === actor)
      throw new ConflictError("cannot delete yourself", "errors.deleteSelf");
    if (user.role === "admin" && (await this.users.countAdmins()) <= 1) {
      throw new ConflictError("cannot delete the last admin", "errors.lastAdmin");
    }
    await this.users.remove(id);
  }
}
