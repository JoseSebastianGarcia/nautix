import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { GatewayRoutesRepository } from "../ports/gateway-routes-repository.js";
import { SaveGatewayRoutesCommand } from "./save-gateway-routes.command.js";

@CommandHandler(SaveGatewayRoutesCommand)
export class SaveGatewayRoutesHandler implements ICommandHandler<SaveGatewayRoutesCommand, void> {
  constructor(@Inject(GatewayRoutesRepository) private readonly routes: GatewayRoutesRepository) {}

  execute({ gateway, routes }: SaveGatewayRoutesCommand): Promise<void> {
    return this.routes.save(gateway, routes);
  }
}
