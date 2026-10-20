import type { GatewayRoute } from "@nautix/contracts";
import { stringify } from "yaml";
import { type GatewayPlan, GatewayStrategy } from "../gateway-strategy.js";
import { BANNER, mustBeOrigin } from "./helpers.js";

/** Traefik file provider: routers, optional strip-prefix middlewares and load-balancer services. */
export const buildTraefikConfig = (routes: GatewayRoute[]): string => {
  const routers: Record<string, unknown> = {};
  const middlewares: Record<string, unknown> = {};
  const services: Record<string, unknown> = {};
  for (const r of routes) {
    const { scheme, host } = mustBeOrigin(r);
    const path = r.path?.replace(/\/$/, "") || undefined;
    const rule =
      [r.host ? `Host(\`${r.host}\`)` : null, path ? `PathPrefix(\`${path}\`)` : null]
        .filter(Boolean)
        .join(" && ") || "PathPrefix(`/`)";
    const strip = r.stripPath && path !== undefined && path !== "";
    routers[r.name] = {
      rule,
      entryPoints: ["web"],
      service: r.name,
      ...(strip ? { middlewares: [`${r.name}-strip`] } : {}),
    };
    if (strip) middlewares[`${r.name}-strip`] = { stripPrefix: { prefixes: [path] } };
    services[r.name] = { loadBalancer: { servers: [{ url: `${scheme}://${host}` }] } };
  }
  const http: Record<string, unknown> = { routers, services };
  if (Object.keys(middlewares).length > 0) http.middlewares = middlewares;
  return `# ${BANNER}\n${stringify({ http }, { lineWidth: 0 })}`;
};

/** Traefik: its file provider watches the dynamic directory, so writing the file is the whole job. */
export class TraefikStrategy extends GatewayStrategy {
  readonly kind = "traefik" as const;

  protected build(routes: GatewayRoute[]): GatewayPlan {
    return {
      mode: "files",
      files: [{ path: "/etc/traefik/dynamic/nautix.yml", content: buildTraefikConfig(routes) }],
      commands: [],
    };
  }
}
