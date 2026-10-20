import { randomUUID } from "node:crypto";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { TOKEN_PREFIX } from "../../domain/user.js";
import { ApiTokenRepository } from "../ports/api-token-repository.js";
import { hashToken, newSessionToken } from "../ports/session-tokens.js";
import { CreateApiTokenCommand } from "./create-api-token.command.js";

/** Returns the raw token once; only its hash is stored. */
@CommandHandler(CreateApiTokenCommand)
export class CreateApiTokenHandler
  implements ICommandHandler<CreateApiTokenCommand, { id: string; token: string }>
{
  constructor(@Inject(ApiTokenRepository) private readonly tokens: ApiTokenRepository) {}

  async execute({ request }: CreateApiTokenCommand): Promise<{ id: string; token: string }> {
    const token = `${TOKEN_PREFIX}${newSessionToken()}`;
    const id = randomUUID();
    await this.tokens.add({
      id,
      name: request.name,
      role: request.role,
      tokenHash: hashToken(token),
      createdAt: Date.now(),
      lastUsedAt: null,
    });
    return { id, token };
  }
}
