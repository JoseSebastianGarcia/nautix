import { Inject } from "@nestjs/common";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { SwarmEngine } from "../ports/swarm-engine.js";
import { GetJoinTokensQuery } from "./get-join-tokens.query.js";

@QueryHandler(GetJoinTokensQuery)
export class GetJoinTokensHandler
  implements IQueryHandler<GetJoinTokensQuery, { worker: string; manager: string }>
{
  constructor(@Inject(SwarmEngine) private readonly engine: SwarmEngine) {}

  execute(c: GetJoinTokensQuery): Promise<{ worker: string; manager: string }> {
    return this.engine.joinTokens();
  }
}
