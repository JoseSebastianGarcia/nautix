import { bindAddressOf } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { NotFoundError, ValidationError } from "../../../../shared/domain-error.js";
import { DockerEngine } from "../ports/docker-engine.js";
import { SelfGuard } from "../self-guard.js";
import { ChangeExposureCommand } from "./change-exposure.command.js";

/**
 * Changes the host address of published ports. Docker cannot rebind a live port, so the container is
 * recreated with the same settings (see `DockerEngine.rebindPorts`): a short interruption, and the
 * original comes back if the new one cannot start.
 */
@CommandHandler(ChangeExposureCommand)
export class ChangeExposureHandler implements ICommandHandler<ChangeExposureCommand, void> {
  constructor(
    @Inject(DockerEngine) private readonly engine: DockerEngine,
    @Inject(SelfGuard) private readonly guard: SelfGuard,
  ) {}

  async execute({ containerId, ports }: ChangeExposureCommand): Promise<void> {
    await this.guard.assertNotSelf(containerId);
    const container = (await this.engine.listContainers()).find(
      (c) => c.id === containerId || c.name === containerId,
    );
    if (!container) throw new NotFoundError("container not found", "errors.notFound");
    const published = new Set(container.ports.map((p) => `${p.privatePort}/${p.type}`));
    for (const p of ports)
      if (!published.has(`${p.containerPort}/${p.protocol}`))
        throw new ValidationError("that port is not published", "errors.portNotPublished");
    await this.engine.rebindPorts(
      container.id,
      ports.map((p) => ({
        containerPort: p.containerPort,
        protocol: p.protocol,
        hostIp: bindAddressOf(p.exposure),
      })),
    );
  }
}
