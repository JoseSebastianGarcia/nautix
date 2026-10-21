import type { GatewayRoute } from "@nautix/contracts";
import { type GatewayPlan, GatewayStrategy } from "../gateway-strategy.js";
import { BANNER, mustBeOrigin } from "./helpers.js";

const safeName = (name: string): string => name.replace(/[^a-zA-Z0-9_-]/g, "_");

/** HAProxy: one backend per route, chosen by Host and path ACLs. Upstream names are resolved through Docker's DNS at run time. */
export const buildHaproxyConfig = (routes: GatewayRoute[]): string => {
  const rules: string[] = [];
  const backends: string[] = [];
  for (const r of routes) {
    const { scheme } = mustBeOrigin(r);
    const url = new URL(r.upstream);
    // HAProxy would reuse the client's port for a server without one, so the port is always explicit.
    const host = `${url.hostname}:${url.port || (scheme === "https" ? "443" : "80")}`;
    const id = safeName(r.name);
    const conditions: string[] = [];
    if (r.host) {
      rules.push(`    acl host_${id} hdr(host),field(1,:) -i ${r.host}`);
      conditions.push(`host_${id}`);
    }
    const path = r.path ?? "/";
    if (path !== "/") {
      rules.push(`    acl path_${id} path_beg ${path}`);
      conditions.push(`path_${id}`);
    }
    if (r.allow.length > 0) {
      rules.push(`    acl src_${id} src ${r.allow.join(" ")}`);
      rules.push(
        `    http-request deny deny_status 403 if ${[...conditions, `!src_${id}`].join(" ")}`,
      );
    }
    rules.push(`    use_backend be_${id}${conditions.length ? ` if ${conditions.join(" ")}` : ""}`);
    const strip =
      r.stripPath && path !== "/"
        ? [`    http-request set-path %[path,regsub(^${path.replace(/\/$/, "")}/?,/)]`]
        : [];
    const tls = scheme === "https" ? " ssl verify required ca-file @system-ca" : "";
    backends.push(
      [
        `backend be_${id}`,
        ...strip,
        `    server s1 ${host} resolvers docker init-addr none${tls}`,
      ].join("\n"),
    );
  }
  return [
    `# ${BANNER}`,
    "global",
    "    maxconn 1024",
    "",
    "defaults",
    "    mode http",
    "    timeout connect 5s",
    "    timeout client 30s",
    "    timeout server 30s",
    "    option forwardfor",
    "",
    "resolvers docker",
    "    nameserver dns1 127.0.0.11:53",
    "    resolve_retries 3",
    "    timeout resolve 1s",
    "    hold valid 10s",
    "",
    "frontend web",
    "    bind :80",
    ...rules,
    "    default_backend be_none",
    "",
    "backend be_none",
    '    http-request return status 404 content-type text/plain string "no route"',
    "",
    ...backends.flatMap((b) => [b, ""]),
  ].join("\n");
};

const HAPROXY_SCRIPT = `set -e
cd /usr/local/etc/haproxy
if haproxy -c -f haproxy.cfg.new; then
  [ -f haproxy.cfg ] && cp haproxy.cfg haproxy.cfg.bak || true
  mv -f haproxy.cfg.new haproxy.cfg
  kill -USR2 1
else
  rm -f haproxy.cfg.new
  echo "configuration rejected; the previous one is still running" >&2
  exit 1
fi`;

/** HAProxy: writes haproxy.cfg.new, checks it with `haproxy -c`, swaps it in and reloads the master process. */
export class HaproxyStrategy extends GatewayStrategy {
  readonly kind = "haproxy" as const;

  protected build(routes: GatewayRoute[]): GatewayPlan {
    return {
      mode: "files",
      files: [
        { path: "/usr/local/etc/haproxy/haproxy.cfg.new", content: buildHaproxyConfig(routes) },
      ],
      commands: [["sh", "-c", HAPROXY_SCRIPT]],
    };
  }
}
