import type { GatewayRoute } from "@nautix/contracts";

export class SaveGatewayRoutesCommand {
  constructor(
    public readonly gateway: string,
    public readonly routes: GatewayRoute[],
  ) {}
}
