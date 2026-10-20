import { Inject } from "@nestjs/common";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { DockerEngine } from "../ports/docker-engine.js";
import { InspectQuery } from "./inspect.query.js";

@QueryHandler(InspectQuery)
export class InspectHandler implements IQueryHandler<InspectQuery, unknown> {
  constructor(@Inject(DockerEngine) private readonly engine: DockerEngine) {}

  async execute(q: InspectQuery): Promise<unknown> {
    return this.engine.inspect(q.kind, q.id);
  }
}
