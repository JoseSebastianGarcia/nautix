import { randomBytes } from "node:crypto";
import type { VolumeBrowseResult } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { NotFoundError, ValidationError } from "../../../../shared/domain-error.js";
import type { EngineContainerSpec } from "../../domain/container-spec.js";
import {
  cleanVolumePath,
  MAX_VIEW_BYTES,
  mountedPath,
  parseLs,
  VOLUME_HELPER_IMAGE,
} from "../../domain/volume-browse.js";
import { DockerEngine } from "../ports/docker-engine.js";
import { BrowseVolumeQuery } from "./browse-volume.query.js";

const RUN_MS = 15_000;

/**
 * Lists a directory or reads the start of a file of a named volume. A throw-away helper
 * container (no network, volume mounted read-only) runs `ls` / `head`; it is always removed.
 */
@QueryHandler(BrowseVolumeQuery)
export class BrowseVolumeHandler implements IQueryHandler<BrowseVolumeQuery, VolumeBrowseResult> {
  constructor(@Inject(DockerEngine) private readonly engine: DockerEngine) {}

  async execute(q: BrowseVolumeQuery): Promise<VolumeBrowseResult> {
    const path = cleanVolumePath(q.path);
    if (!(await this.engine.listVolumes()).some((v) => v.name === q.volume))
      throw new NotFoundError("volume not found", "errors.notFound");
    const target = mountedPath(path);
    return this.withHelper(q.volume, async (id) => {
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

  private async withHelper<T>(volume: string, work: (id: string) => Promise<T>): Promise<T> {
    const spec: EngineContainerSpec = {
      name: `nautix-browse-${randomBytes(4).toString("hex")}`,
      image: VOLUME_HELPER_IMAGE,
      env: [],
      labels: { "nautix.managed": "true", "nautix.helper": "volume-browse" },
      cmd: ["sleep", "60"],
      exposedPorts: {},
      portBindings: {},
      binds: [`${volume}:/v:ro`],
      restartPolicy: "no",
      networkName: "none",
    };
    await this.engine.pullImageIfMissing(VOLUME_HELPER_IMAGE);
    const helper = await this.engine.createContainer(spec);
    try {
      await this.engine.containerAction(helper.id, "start");
      return await work(helper.id);
    } finally {
      await this.engine.removeContainer(helper.id, true).catch(() => undefined);
    }
  }
}
