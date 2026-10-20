import type { GatewayRoute } from "@nautix/contracts";

export abstract class GatewayRoutesRepository {
  abstract get(gateway: string): Promise<GatewayRoute[]>;
  abstract save(gateway: string, routes: GatewayRoute[]): Promise<void>;
}
