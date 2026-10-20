import { checkFixedIp } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { ConflictError, NotFoundError, ValidationError } from "../../../../shared/domain-error.js";
import { DockerEngine } from "../ports/docker-engine.js";
import { SelfGuard } from "../self-guard.js";
import { SetFixedIpCommand } from "./set-fixed-ip.command.js";

/**
 * Pins (or releases) the address of a container on one network. Docker only takes the address when the
 * container joins the network, so it is reconnected: its other networks and its process are untouched,
 * but connections through this network drop for a moment.
 */
@CommandHandler(SetFixedIpCommand)
export class SetFixedIpHandler implements ICommandHandler<SetFixedIpCommand, void> {
  constructor(
    @Inject(DockerEngine) private readonly engine: DockerEngine,
    @Inject(SelfGuard) private readonly guard: SelfGuard,
  ) {}

  async execute({ containerId, network: ref, ip }: SetFixedIpCommand): Promise<void> {
    await this.guard.assertNotSelf(containerId);
    const [containers, networks] = await Promise.all([
      this.engine.listContainers(),
      this.engine.listNetworks(),
    ]);
    const container = containers.find((c) => c.id === containerId || c.name === containerId);
    if (!container) throw new NotFoundError("container not found", "errors.notFound");
    const network = networks.find((n) => n.id === ref || n.name === ref);
    if (!network) throw new NotFoundError("network not found", "errors.networkNotFound");
    if (network.system)
      throw new ValidationError(
        "fixed IPs need a user-defined network",
        "errors.fixedIpNeedsNetwork",
      );
    if (!container.networks.includes(network.name))
      throw new ConflictError("the container is not on that network", "errors.notOnNetwork");

    if (ip !== null) {
      const taken = containers.flatMap((c) =>
        c.id !== container.id && c.ips?.[network.name] ? [c.ips[network.name] as string] : [],
      );
      const problem = checkFixedIp(ip, network.subnet, taken);
      if (problem === "inUse")
        throw new ConflictError("that address is in use", "errors.fixedIpInUse");
      if (problem)
        throw new ValidationError(`fixed IP rejected: ${problem}`, `errors.fixedIp_${problem}`);
    }
    await this.engine.disconnectNetwork(network.id, container.id);
    try {
      await this.engine.connectNetwork(network.id, container.id, ip ?? undefined);
    } catch (error) {
      // Never leave the container off the network because the new address was refused.
      await this.engine.connectNetwork(network.id, container.id).catch(() => undefined);
      throw error;
    }
  }
}
