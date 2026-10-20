import type { Readable } from "node:stream";
import { Inject } from "@nestjs/common";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { DockerEngine } from "../ports/docker-engine.js";
import { SaveImageQuery } from "./save-image.query.js";

@QueryHandler(SaveImageQuery)
export class SaveImageHandler implements IQueryHandler<SaveImageQuery, Readable> {
  constructor(@Inject(DockerEngine) private readonly engine: DockerEngine) {}

  execute(q: SaveImageQuery): Promise<Readable> {
    return this.engine.saveImages(q.refs);
  }
}
