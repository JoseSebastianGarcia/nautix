import type { GatewayRoute } from "@nautix/contracts";
import { ValidationError } from "../../../../shared/domain-error.js";

export const BANNER =
  "Managed by Nautix. Edit the routes in the Gateway page; manual changes are overwritten.";

/** For proxies whose upstream is a bare origin: rejects URLs with a path, query or fragment. */
export const mustBeOrigin = (route: GatewayRoute): { scheme: string; host: string } => {
  const url = new URL(route.upstream);
  if ((url.pathname !== "/" && url.pathname !== "") || url.search !== "" || url.hash !== "") {
    throw new ValidationError(
      `route ${route.name}: this gateway needs an upstream without a path`,
      "errors.gatewayUpstreamPath",
    );
  }
  return { scheme: url.protocol.replace(":", ""), host: url.host };
};

/** Groups routes by domain ("" = path-only routes), keeping their order. */
export const groupByHost = (routes: GatewayRoute[]): Map<string, GatewayRoute[]> => {
  const byHost = new Map<string, GatewayRoute[]>();
  for (const r of routes) byHost.set(r.host ?? "", [...(byHost.get(r.host ?? "") ?? []), r]);
  return byHost;
};
