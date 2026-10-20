import type { GatewayRoute } from "@nautix/contracts";
import { type GatewayPlan, GatewayStrategy } from "../gateway-strategy.js";
import { buildKongConfig } from "../kong-config.js";

/** Kong in DB-less mode: the declarative YAML is posted to the admin API (see ApplyGatewayHandler). */
export class KongStrategy extends GatewayStrategy {
  readonly kind = "kong" as const;

  protected build(routes: GatewayRoute[]): GatewayPlan {
    return { mode: "kong", yaml: buildKongConfig(routes) };
  }
}
