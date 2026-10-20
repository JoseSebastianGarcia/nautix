import type { GatewayRoute } from "@nautix/contracts";
import { type GatewayPlan, GatewayStrategy } from "../gateway-strategy.js";
import { BANNER, groupByHost, mustBeOrigin } from "./helpers.js";

/** Caddy: `handle_path` strips the prefix, `handle` keeps it; plain http (no automatic TLS for local names). */
export const buildCaddyfile = (routes: GatewayRoute[]): string => {
  const block = (r: GatewayRoute): string => {
    const { scheme, host } = mustBeOrigin(r);
    const path = r.path ?? "/";
    const matcher = path === "/" ? "" : ` ${path.replace(/\/$/, "")}*`;
    const directive = r.stripPath && path !== "/" ? "handle_path" : "handle";
    return [`\t${directive}${matcher} {`, `\t\treverse_proxy ${scheme}://${host}`, "\t}"].join(
      "\n",
    );
  };
  const byHost = groupByHost(routes);
  const sites: string[] = [];
  const pathOnly = byHost.get("") ?? [];
  if (pathOnly.length > 0 || byHost.size === 0)
    sites.push([":80 {", ...pathOnly.map(block), "}"].join("\n"));
  for (const [host, list] of byHost)
    if (host !== "") sites.push([`http://${host} {`, ...list.map(block), "}"].join("\n"));
  return [`# ${BANNER}`, "{", "\tauto_https off", "}", "", ...sites, ""].join("\n");
};

const CADDY_SCRIPT = `set -e
cd /etc/caddy
caddy validate --config Caddyfile.new --adapter caddyfile
[ -f Caddyfile ] && cp Caddyfile Caddyfile.bak || true
mv -f Caddyfile.new Caddyfile
caddy reload --config Caddyfile --adapter caddyfile`;

/** Caddy: writes the Caddyfile, validates it and reloads through its admin endpoint inside the container. */
export class CaddyStrategy extends GatewayStrategy {
  readonly kind = "caddy" as const;

  protected build(routes: GatewayRoute[]): GatewayPlan {
    return {
      mode: "files",
      files: [{ path: "/etc/caddy/Caddyfile.new", content: buildCaddyfile(routes) }],
      commands: [["sh", "-c", CADDY_SCRIPT]],
    };
  }
}
