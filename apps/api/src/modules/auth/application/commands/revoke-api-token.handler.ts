import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { ApiTokenRepository } from "../ports/api-token-repository.js";
import { RevokeApiTokenCommand } from "./revoke-api-token.command.js";

@CommandHandler(RevokeApiTokenCommand)
export class RevokeApiTokenHandler implements ICommandHandler<RevokeApiTokenCommand, void> {
  constructor(@Inject(ApiTokenRepository) private readonly tokens: ApiTokenRepository) {}

  execute({ id }: RevokeApiTokenCommand): Promise<void> {
    return this.tokens.remove(id);
  }
}
