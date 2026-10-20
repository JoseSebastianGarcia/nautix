import type { PrunePreview } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { previewPrune } from "../../domain/prune-preview.js";
import { DockerEngine } from "../ports/docker-engine.js";
import { PreviewPruneQuery } from "./preview-prune.query.js";

/** Dry run: the wizard shows exactly what a prune would delete before asking for confirmation. */
@QueryHandler(PreviewPruneQuery)
export class PreviewPruneHandler implements IQueryHandler<PreviewPruneQuery, PrunePreview> {
  constructor(@Inject(DockerEngine) private readonly engine: DockerEngine) {}

  async execute({ kind, all }: PreviewPruneQuery): Promise<PrunePreview> {
    const [containers, images, volumes, networks] = await Promise.all([
      this.engine.listContainers(),
      this.engine.listImages(),
      this.engine.listVolumes(),
      this.engine.listNetworks(),
    ]);
    return previewPrune(kind, { containers, images, volumes, networks }, all);
  }
}
