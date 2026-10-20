import type { GatewayKind, GatewayRoute } from "@nautix/contracts";
import { strategyFor } from "./gateway-strategies/index.js";
import { type GatewayPlan } from "./gateway-strategy.js";

export type { GatewayPlan };

/** Delivery plan for a gateway type; validates the routes for that type first. */
export const planGateway = (kind: GatewayKind, routes: GatewayRoute[]): GatewayPlan =>
  strategyFor(kind).plan(routes);
