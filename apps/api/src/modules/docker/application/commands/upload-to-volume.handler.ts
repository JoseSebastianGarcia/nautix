import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { ForbiddenError } from "../../../../shared/domain-error.js";
import { cleanVolumePath, mountedPath, volumeNamesIn } from "../../domain/volume-browse.js";
import { DockerEngine } from "../ports/docker-engine.js";
import { SelfIdentity } from "../ports/self-identity.js";
import { VolumeHelper } from "../volume-helper.js";
import { UploadToVolumeCommand } from "./upload-to-volume.command.js";

/**
 * Extracts a tar into a directory of a volume through a throw-away helper that mounts it read-write.
 * Files that already exist are replaced. The volume that holds Nautix's own data is refused: its
 * database and encryption key must not be overwritten from the interface that depends on them.
 */
@CommandHandler(UploadToVolumeCommand)
export class UploadToVolumeHandler implements ICommandHandler<UploadToVolumeCommand, void> {
  constructor(
    @Inject(DockerEngine) private readonly engine: DockerEngine,
    @Inject(SelfIdentity) private readonly self: SelfIdentity,
    @Inject(VolumeHelper) private readonly helper: VolumeHelper,
  ) {}

  async execute(c: UploadToVolumeCommand): Promise<void> {
    const path = cleanVolumePath(c.path);
    if ((await this.selfVolumes()).includes(c.volume))
      throw new ForbiddenError("this volume holds Nautix's own data", "errors.selfVolume");
    await this.helper.use(c.volume, false, (id) =>
      this.engine.putArchive(id, mountedPath(path), c.tar),
    );
  }

  private async selfVolumes(): Promise<string[]> {
    const self = (await this.engine.listContainers()).find((x) => this.self.matches(x));
    if (!self) return [];
    return volumeNamesIn(await this.engine.inspect("container", self.id));
  }
}
