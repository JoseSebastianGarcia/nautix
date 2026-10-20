import type { GatewayRoute } from "@nautix/contracts";

export class ApplyGatewayCommand {
  constructor(
    public readonly container: string,
    public readonly routes: GatewayRoute[],
  ) {}
}
