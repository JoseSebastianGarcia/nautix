import type { GatewayRoute } from "@nautix/contracts";
import { type GatewayPlan, GatewayStrategy } from "../gateway-strategy.js";
import { BANNER, groupByHost, mustBeOrigin } from "./helpers.js";

const escapeRegex = (path: string): string => path.replace(/[.]/g, "\\.");

/** nginx: one server per host plus a default server for path-only routes. Upstreams are resolved at request time through Docker's DNS. */
export const buildNginxConfig = (routes: GatewayRoute[]): string => {
  const location = (r: GatewayRoute): string => {
    const { scheme, host } = mustBeOrigin(r);
    const path = r.path ?? "/";
    const strip = r.stripPath && path !== "/";
    const lines = [
      `    location ${path === "/" ? "/" : `^~ ${path}`} {`,
      `        set $nautix_upstream ${scheme}://${host};`,
      ...(strip
        ? [`        rewrite ^${escapeRegex(path.replace(/\/$/, ""))}(?:/(.*))?$ /$1 break;`]
        : []),
      "        proxy_pass $nautix_upstream;",
      "        proxy_http_version 1.1;",
      "        proxy_ssl_server_name on;",
      "        proxy_set_header Host $proxy_host;",
      "        proxy_set_header X-Real-IP $remote_addr;",
      "        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;",
      "        proxy_set_header X-Forwarded-Proto $scheme;",
      "    }",
    ];
    return lines.join("\n");
  };
  const byHost = groupByHost(routes);
  const servers: string[] = [];
  const pathOnly = byHost.get("") ?? [];
  servers.push(
    [
      "server {",
      "    listen 80 default_server;",
      "    server_name _;",
      ...pathOnly.map(location),
      "}",
    ].join("\n"),
  );
  for (const [host, list] of byHost) {
    if (host === "") continue;
    servers.push(
      ["server {", "    listen 80;", `    server_name ${host};`, ...list.map(location), "}"].join(
        "\n",
      ),
    );
  }
  return [`# ${BANNER}`, "resolver 127.0.0.11 valid=10s ipv6=off;", "", ...servers, ""].join("\n");
};

const NGINX_SCRIPT = `set -e
cd /etc/nginx/conf.d
[ -f 00-nautix.conf ] && cp 00-nautix.conf 00-nautix.conf.bak || true
mv -f 00-nautix.conf.new 00-nautix.conf
if nginx -t; then
  nginx -s reload
else
  if [ -f 00-nautix.conf.bak ]; then mv -f 00-nautix.conf.bak 00-nautix.conf; else rm -f 00-nautix.conf; fi
  echo "configuration rejected; the previous one was restored" >&2
  exit 1
fi`;

/** Nginx: writes conf.d/00-nautix.conf, validates with `nginx -t` and reloads; restores the old file if rejected. */
export class NginxStrategy extends GatewayStrategy {
  readonly kind = "nginx" as const;

  protected build(routes: GatewayRoute[]): GatewayPlan {
    return {
      mode: "files",
      files: [{ path: "/etc/nginx/conf.d/00-nautix.conf.new", content: buildNginxConfig(routes) }],
      commands: [["sh", "-c", NGINX_SCRIPT]],
    };
  }
}
