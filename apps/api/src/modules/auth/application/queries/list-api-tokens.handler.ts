import type { ApiTokenInfo } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { ApiTokenRepository } from "../ports/api-token-repository.js";
import { ListApiTokensQuery } from "./list-api-tokens.query.js";

@QueryHandler(ListApiTokensQuery)
export class ListApiTokensHandler implements IQueryHandler<ListApiTokensQuery, ApiTokenInfo[]> {
  constructor(@Inject(ApiTokenRepository) private readonly tokens: ApiTokenRepository) {}

  async execute(): Promise<ApiTokenInfo[]> {
    // The hash never leaves the server.
    return (await this.tokens.list()).map(({ id, name, role, createdAt, lastUsedAt }) => ({
      id,
      name,
      role,
      createdAt,
      lastUsedAt,
    }));
  }
}
