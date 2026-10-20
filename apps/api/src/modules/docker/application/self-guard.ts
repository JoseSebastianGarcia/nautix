import { Inject, Injectable } from "@nestjs/common";
import { ConflictError } from "../../../shared/domain-error.js";
import { DockerEngine } from "./ports/docker-engine.js";
import { SelfIdentity } from "./ports/self-identity.js";

/** Nautix never stops, removes or cuts off its own container unless the user types its name. */
@Injectable()
export class SelfGuard {
  constructor(
    @Inject(DockerEngine) private readonly engine: DockerEngine,
    @Inject(SelfIdentity) private readonly self: SelfIdentity,
  ) {}

  async assertAllowed(containerId: string, confirm: string | undefined): Promise<void> {
    const target = (await this.engine.listContainers()).find(
      (c) => c.id === containerId || c.name === containerId,
    );
    if (target && this.self.matches(target) && confirm !== target.name) {
      throw new ConflictError(
        "this is the container running Nautix; type its name to confirm",
        "errors.selfProtected",
      );
    }
  }
}
