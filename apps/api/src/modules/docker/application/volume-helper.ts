import { randomBytes } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { NotFoundError } from "../../../shared/domain-error.js";
import type { EngineContainerSpec } from "../domain/container-spec.js";
import { VOLUME_HELPER_IMAGE } from "../domain/volume-browse.js";
import { DockerEngine } from "./ports/docker-engine.js";

export interface OpenedHelper {
  /** The helper container; the volume is mounted at `/v`. */
  id: string;
  /** Removes the helper. Always call it, also when the work failed. */
  release: () => Promise<void>;
}

/**
 * A throw-away container (no network, nothing running but `sleep`) that has one volume mounted, so a
 * volume can be listed, read, downloaded or written with the engine's own file APIs and no shell
 * strings. It is labelled and short-lived; callers must release it.
 */
@Injectable()
export class VolumeHelper {
  constructor(@Inject(DockerEngine) private readonly engine: DockerEngine) {}

  async open(volume: string, readOnly: boolean): Promise<OpenedHelper> {
    if (!(await this.engine.listVolumes()).some((v) => v.name === volume))
      throw new NotFoundError("volume not found", "errors.notFound");
    const spec: EngineContainerSpec = {
      name: `nautix-browse-${randomBytes(4).toString("hex")}`,
      image: VOLUME_HELPER_IMAGE,
      env: [],
      labels: { "nautix.managed": "true", "nautix.helper": "volume-browse" },
      cmd: ["sleep", "60"],
      exposedPorts: {},
      portBindings: {},
      binds: [`${volume}:/v${readOnly ? ":ro" : ""}`],
      restartPolicy: "no",
      networkName: "none",
    };
    await this.engine.pullImageIfMissing(VOLUME_HELPER_IMAGE);
    const helper = await this.engine.createContainer(spec);
    const release = () => this.engine.removeContainer(helper.id, true).catch(() => undefined);
    try {
      await this.engine.containerAction(helper.id, "start");
    } catch (e) {
      await release();
      throw e;
    }
    return { id: helper.id, release };
  }

  async use<T>(volume: string, readOnly: boolean, work: (id: string) => Promise<T>): Promise<T> {
    const helper = await this.open(volume, readOnly);
    try {
      return await work(helper.id);
    } finally {
      await helper.release();
    }
  }
}
