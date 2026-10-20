import { GATEWAY_KINDS, type GatewayKind } from "@nautix/contracts";
import type { GatewayStrategy } from "../gateway-strategy.js";
import { CaddyStrategy } from "./caddy.strategy.js";
import { HaproxyStrategy } from "./haproxy.strategy.js";
import { KongStrategy } from "./kong.strategy.js";
import { NginxStrategy } from "./nginx.strategy.js";
import { TraefikStrategy } from "./traefik.strategy.js";

const STRATEGIES: Record<GatewayKind, GatewayStrategy> = {
  kong: new KongStrategy(),
  nginx: new NginxStrategy(),
  caddy: new CaddyStrategy(),
  traefik: new TraefikStrategy(),
  haproxy: new HaproxyStrategy(),
};

/** Registry: the only place that knows which strategies exist. */
export const strategyFor = (kind: GatewayKind): GatewayStrategy => STRATEGIES[kind];

export const supportedKinds = (): readonly GatewayKind[] => GATEWAY_KINDS;
