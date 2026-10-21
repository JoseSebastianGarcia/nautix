import { Inject } from "@nestjs/common";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { GuardStore } from "../ports/guard-store.js";
import { VerifyGuardTokenQuery } from "./verify-guard-token.query.js";

@QueryHandler(VerifyGuardTokenQuery)
export class VerifyGuardTokenHandler implements IQueryHandler<VerifyGuardTokenQuery, boolean> {
  constructor(@Inject(GuardStore) private readonly store: GuardStore) {}

  execute({ token }: VerifyGuardTokenQuery): Promise<boolean> {
    return this.store.verifyToken(token);
  }
}
