import { Inject } from "@nestjs/common";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { SwarmEngine } from "../ports/swarm-engine.js";
import { GetSwarmUnlockKeyQuery } from "./get-swarm-unlock-key.query.js";

@QueryHandler(GetSwarmUnlockKeyQuery)
export class GetSwarmUnlockKeyHandler implements IQueryHandler<GetSwarmUnlockKeyQuery, string> {
  constructor(@Inject(SwarmEngine) private readonly engine: SwarmEngine) {}

  execute(c: GetSwarmUnlockKeyQuery): Promise<string> {
    return this.engine.unlockKey();
  }
}
