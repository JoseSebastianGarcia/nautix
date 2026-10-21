import type { VolumeBrowseResult } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { NotFoundError, ValidationError } from "../../../../shared/domain-error.js";
import {
  cleanVolumePath,
  MAX_VIEW_BYTES,
  mountedPath,
  parseLs,
} from "../../domain/volume-browse.js";
import { DockerEngine } from "../ports/docker-engine.js";
import { VolumeHelper } from "../volume-helper.js";
import { BrowseVolumeQuery } from "./browse-volume.query.js";

const RUN_MS = 15_000;

/**
 * Lists a directory or reads the start of a file of a named volume. A throw-away helper
 * container (no network, volume mounted read-only) runs `ls` / `head`; it is always removed.
 */
@QueryHandler(BrowseVolumeQuery)
export class BrowseVolumeHandler implements IQueryHandler<BrowseVolumeQuery, VolumeBrowseResult> {
  constructor(
    @Inject(DockerEngine) private readonly engine: DockerEngine,
    @Inject(VolumeHelper) private readonly helper: VolumeHelper,
  ) {}

  async execute(q: BrowseVolumeQuery): Promise<VolumeBrowseResult> {
    const path = cleanVolumePath(q.path);
    const target = mountedPath(path);
    return this.helper.use(q.volume, true, async (id) => {
      if (!q.view) {
        const out = await this.engine.runCommand(id, ["ls", "-lAp", "--", target], RUN_MS, 400_000);
        if (out.exitCode !== 0)
          throw new NotFoundError(out.output.trim() || "cannot list", "errors.notFound");
        return { kind: "directory", path, entries: parseLs(out.output) };
      }
      const out = await this.engine.runCommand(
        id,
        ["head", "-c", String(MAX_VIEW_BYTES + 1), "--", target],
        RUN_MS,
        MAX_VIEW_BYTES + 1,
      );
      if (out.exitCode !== 0)
        throw new ValidationError(out.output.trim() || "cannot read", "errors.notAFile");
      const truncated = out.output.length > MAX_VIEW_BYTES;
      return { kind: "file", path, content: out.output.slice(0, MAX_VIEW_BYTES), truncated };
    });
  }
}
