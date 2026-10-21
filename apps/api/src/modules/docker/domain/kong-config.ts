import type { GatewayRoute } from "@nautix/contracts";
import { stringify } from "yaml";

/**
 * Kong declarative configuration (DB-less mode) for a list of routes. One Kong service per route,
 * so each route can have its own upstream. Pure: the YAML is what gets posted to `/config`.
 */
export const buildKongConfig = (routes: GatewayRoute[]): string => {
  const doc = {
    _format_version: "3.0",
    services: routes.map((r) => ({
      name: r.name,
      url: r.upstream,
      routes: [
        {
          name: r.name,
          ...(r.path !== undefined ? { paths: [r.path] } : {}),
          ...(r.host !== undefined ? { hosts: [r.host] } : {}),
          strip_path: r.stripPath,
          ...(r.allow.length > 0
            ? { plugins: [{ name: "ip-restriction", config: { allow: r.allow } }] }
            : {}),
        },
      ],
    })),
  };
  return stringify(doc, { lineWidth: 0 });
};
