import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { NotFoundError } from "../../../../shared/domain-error.js";
import { buildContainerSpec } from "../../domain/container-spec.js";
import { DockerEngine } from "../ports/docker-engine.js";
import { CreateContainerCommand } from "./create-container.command.js";

@CommandHandler(CreateContainerCommand)
export class CreateContainerHandler
  implements ICommandHandler<CreateContainerCommand, { id: string }>
{
  constructor(@Inject(DockerEngine) private readonly engine: DockerEngine) {}

  async execute({ request }: CreateContainerCommand): Promise<{ id: string }> {
    let networkName: string | undefined;
    if (request.networkId) {
      const network = (await this.engine.listNetworks()).find((n) => n.id === request.networkId);
      if (!network) throw new NotFoundError("network not found", "errors.networkNotFound");
      networkName = network.name;
    }
    await this.engine.pullImageIfMissing(request.image);
    const created = await this.engine.createContainer(buildContainerSpec(request, networkName));
    if (request.start) await this.engine.containerAction(created.id, "start");
    return created;
  }
}
