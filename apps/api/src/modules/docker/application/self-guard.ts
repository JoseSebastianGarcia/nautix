import { Inject, Injectable } from "@nestjs/common";
import { ForbiddenError } from "../../../shared/domain-error.js";
import { DockerEngine } from "./ports/docker-engine.js";
import { SelfIdentity } from "./ports/self-identity.js";

/**
 * The container running Nautix is locked: nobody (no role, no API token) can stop, restart,
 * pause, remove or reconfigure it from here. To manage it, use the Docker CLI on the host.
 */
@Injectable()
export class SelfGuard {
  constructor(
    @Inject(DockerEngine) private readonly engine: DockerEngine,
    @Inject(SelfIdentity) private readonly self: SelfIdentity,
  ) {}

  async assertNotSelf(containerId: string): Promise<void> {
    const target = (await this.engine.listContainers()).find(
      (c) => c.id === containerId || c.name === containerId,
    );
    if (target && this.self.matches(target)) {
      throw new ForbiddenError(
        "this is the container running Nautix and it is locked",
        "errors.selfLocked",
      );
    }
  }
}
