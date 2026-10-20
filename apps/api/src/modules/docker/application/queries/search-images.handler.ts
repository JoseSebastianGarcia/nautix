import type { ImageSearchResult } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { DockerEngine } from "../ports/docker-engine.js";
import { SearchImagesQuery } from "./search-images.query.js";

@QueryHandler(SearchImagesQuery)
export class SearchImagesHandler implements IQueryHandler<SearchImagesQuery, ImageSearchResult[]> {
  constructor(@Inject(DockerEngine) private readonly engine: DockerEngine) {}

  execute(q: SearchImagesQuery): Promise<ImageSearchResult[]> {
    return this.engine.searchImages(q.term, q.limit);
  }
}
