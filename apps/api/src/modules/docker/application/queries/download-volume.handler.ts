import { PassThrough, type Readable } from "node:stream";
import { Inject } from "@nestjs/common";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { cleanVolumePath, mountedPath } from "../../domain/volume-browse.js";
import { DockerEngine } from "../ports/docker-engine.js";
import { VolumeHelper } from "../volume-helper.js";
import { DownloadVolumeQuery } from "./download-volume.query.js";

/**
 * A file or folder of a volume as a tar stream. The helper mounts the volume read-only and is removed
 * when the stream ends, is cancelled or fails, so a download that the browser abandons leaves nothing behind.
 */
@QueryHandler(DownloadVolumeQuery)
export class DownloadVolumeHandler implements IQueryHandler<DownloadVolumeQuery, Readable> {
  constructor(
    @Inject(DockerEngine) private readonly engine: DockerEngine,
    @Inject(VolumeHelper) private readonly helper: VolumeHelper,
  ) {}

  async execute(q: DownloadVolumeQuery): Promise<Readable> {
    const path = cleanVolumePath(q.path);
    const opened = await this.helper.open(q.volume, true);
    try {
      const source = await this.engine.getArchive(opened.id, mountedPath(path));
      const out = new PassThrough();
      const done = () => void opened.release();
      out.once("close", done);
      source.once("error", (e) => out.destroy(e));
      out.once("close", () => source.destroy());
      source.pipe(out);
      return out;
    } catch (e) {
      await opened.release();
      throw e;
    }
  }
}
