import type { StackInfo } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { stacksOf } from "../../domain/swarm-spec.js";
import { SwarmEngine } from "../ports/swarm-engine.js";
import { ListStacksQuery } from "./list-stacks.query.js";

@QueryHandler(ListStacksQuery)
export class ListStacksHandler implements IQueryHandler<ListStacksQuery, StackInfo[]> {
  constructor(@Inject(SwarmEngine) private readonly engine: SwarmEngine) {}

  async execute(): Promise<StackInfo[]> {
    return stacksOf(await this.engine.services());
  }
}
