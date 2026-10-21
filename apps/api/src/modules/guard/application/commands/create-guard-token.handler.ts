import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { GuardStore } from "../ports/guard-store.js";
import { CreateGuardTokenCommand } from "./create-guard-token.command.js";

/** Creates (or replaces) the token the helper uses. It is shown once; only its hash is kept. */
@CommandHandler(CreateGuardTokenCommand)
export class CreateGuardTokenHandler implements ICommandHandler<CreateGuardTokenCommand, string> {
  constructor(@Inject(GuardStore) private readonly store: GuardStore) {}

  execute(): Promise<string> {
    return this.store.createToken();
  }
}
