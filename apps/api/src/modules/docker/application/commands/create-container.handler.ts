import { checkFixedIp, missingConsent } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { ConflictError, NotFoundError, ValidationError } from "../../../../shared/domain-error.js";
import { buildContainerSpec } from "../../domain/container-spec.js";
import { DockerEngine } from "../ports/docker-engine.js";
import { CreateContainerCommand } from "./create-container.command.js";

@CommandHandler(CreateContainerCommand)
export class CreateContainerHandler
  implements ICommandHandler<CreateContainerCommand, { id: string }>
{
  constructor(@Inject(DockerEngine) private readonly engine: DockerEngine) {}

  async execute({ request }: CreateContainerCommand): Promise<{ id: string }> {
    // A folder mount that reaches the host (the Docker socket, `/`, sensitive paths) is never silent: it
    // needs the risk listed in `acceptRisks`. A bind slipped into `volumes` is checked the same way.
    const spec = buildContainerSpec(request, undefined);
    const unaccepted = missingConsent(spec.binds, request.acceptRisks);
    if (unaccepted.length > 0)
      throw new ValidationError(
        `mount needs explicit consent: ${unaccepted.join(", ")}`,
        "errors.mountRisk",
      );
    let networkName: string | undefined;
    if (request.networkId) {
      const network = (await this.engine.listNetworks()).find((n) => n.id === request.networkId);
      if (!network) throw new NotFoundError("network not found", "errors.networkNotFound");
      networkName = network.name;
      if (request.ipAddress) await this.assertFixedIpFree(request.ipAddress, network);
    } else if (request.ipAddress) {
      throw new ValidationError("a fixed IP needs a network", "errors.fixedIpNeedsNetwork");
    }
    await this.engine.pullImageIfMissing(request.image);
    const created = await this.engine.createContainer(buildContainerSpec(request, networkName));
    if (request.start) await this.engine.containerAction(created.id, "start");
    return created;
  }

  private async assertFixedIpFree(
    ip: string,
    network: { name: string; subnet: string | null },
  ): Promise<void> {
    const taken = (await this.engine.listContainers()).flatMap((c) => {
      const used = c.ips?.[network.name];
      return used ? [used] : [];
    });
    const problem = checkFixedIp(ip, network.subnet, taken);
    if (problem === "inUse")
      throw new ConflictError("that address is in use", "errors.fixedIpInUse");
    if (problem)
      throw new ValidationError(`fixed IP rejected: ${problem}`, `errors.fixedIp_${problem}`);
  }
}
