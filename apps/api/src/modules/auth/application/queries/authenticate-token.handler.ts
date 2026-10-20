import { Inject } from "@nestjs/common";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import type { Principal } from "../../../../shared/principal.js";
import { TOKEN_PREFIX } from "../../domain/user.js";
import { ApiTokenRepository } from "../ports/api-token-repository.js";
import { hashToken } from "../ports/session-tokens.js";
import { AuthenticateTokenQuery } from "./authenticate-token.query.js";

const TOUCH_EVERY_MS = 60_000;

@QueryHandler(AuthenticateTokenQuery)
export class AuthenticateTokenHandler
  implements IQueryHandler<AuthenticateTokenQuery, Principal | null>
{
  constructor(@Inject(ApiTokenRepository) private readonly tokens: ApiTokenRepository) {}

  async execute({ rawToken }: AuthenticateTokenQuery): Promise<Principal | null> {
    if (!rawToken.startsWith(TOKEN_PREFIX)) return null;
    const token = await this.tokens.findByHash(hashToken(rawToken));
    if (!token) return null;
    const now = Date.now();
    if (!token.lastUsedAt || now - token.lastUsedAt > TOUCH_EVERY_MS)
      await this.tokens.touch(token.id, now);
    return { kind: "token", name: token.name, role: token.role };
  }
}
