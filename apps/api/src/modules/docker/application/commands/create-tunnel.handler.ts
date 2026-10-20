import { TUNNEL_IMAGE } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { planTunnel } from "../../domain/tunnel.js";
import { DockerEngine } from "../ports/docker-engine.js";
import { CreateTunnelCommand } from "./create-tunnel.command.js";

@CommandHandler(CreateTunnelCommand)
export class CreateTunnelHandler implements ICommandHandler<CreateTunnelCommand, { id: string }> {
  constructor(@Inject(DockerEngine) private readonly engine: DockerEngine) {}

  async execute({ request }: CreateTunnelCommand): Promise<{ id: string }> {
    const [networks, containers] = await Promise.all([
      this.engine.listNetworks(),
      this.engine.listContainers(),
    ]);
    const { spec, destination } = planTunnel(request, networks, containers);

    await this.engine.pullImageIfMissing(TUNNEL_IMAGE);
    const created = await this.engine.createContainer(spec);
    try {
      await this.engine.connectNetwork(destination.id, created.id);
      await this.engine.containerAction(created.id, "start");
    } catch (error) {
      // Never leave a half-wired forwarder behind.
      await this.engine.removeContainer(created.id, true).catch(() => undefined);
      throw error;
    }
    return created;
  }
}
