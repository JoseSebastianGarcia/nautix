import type { Image } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { DockerEngine } from "../ports/docker-engine.js";
import { ListImagesQuery } from "./list-images.query.js";

@QueryHandler(ListImagesQuery)
export class ListImagesHandler implements IQueryHandler<ListImagesQuery, Image[]> {
  constructor(@Inject(DockerEngine) private readonly engine: DockerEngine) {}

  execute(): Promise<Image[]> {
    return this.engine.listImages();
  }
}
