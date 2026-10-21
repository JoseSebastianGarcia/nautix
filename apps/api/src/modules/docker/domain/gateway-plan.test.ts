import { GatewayRoute } from "@nautix/contracts";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { planGateway } from "./gateway-plan.js";
import { buildCaddyfile } from "./gateway-strategies/caddy.strategy.js";
import { buildHaproxyConfig } from "./gateway-strategies/haproxy.strategy.js";
import { strategyFor, supportedKinds } from "./gateway-strategies/index.js";
import { buildNginxConfig } from "./gateway-strategies/nginx.strategy.js";
import { buildTraefikConfig } from "./gateway-strategies/traefik.strategy.js";
import { buildKongConfig } from "./kong-config.js";

const r = (over: Record<string, unknown> = {}) =>
  GatewayRoute.parse({
    name: "hola",
    path: "/hola",
    upstream: "http://tunnel-extranet-to-intranet-80:80",
    ...over,
  });

describe("nginx", () => {
  it("proxies by path with the prefix stripped and runtime DNS resolution", () => {
    const conf = buildNginxConfig([r()]);
    expect(conf).toContain("resolver 127.0.0.11");
    expect(conf).toContain("listen 80 default_server;");
    expect(conf).toContain("location ^~ /hola {");
    expect(conf).toContain("set $nautix_upstream http://tunnel-extranet-to-intranet-80;");
    expect(conf).toContain("rewrite ^/hola(?:/(.*))?$ /$1 break;");
    expect(conf).toContain("proxy_pass $nautix_upstream;");
  });

  it("keeps the prefix when stripPath is off and escapes dots in paths", () => {
    expect(buildNginxConfig([r({ stripPath: false })])).not.toContain("rewrite");
    expect(buildNginxConfig([r({ path: "/v1.0/api" })])).toContain(
      "rewrite ^/v1\\.0/api(?:/(.*))?$",
    );
  });

  it("creates one server per domain", () => {
    const conf = buildNginxConfig([
      r(),
      r({ name: "api", path: undefined, host: "api.mi.lan", upstream: "https://svc:8443" }),
    ]);
    expect(conf).toContain("server_name api.mi.lan;");
    expect(conf).toContain("set $nautix_upstream https://svc:8443;");
    expect(conf).toMatch(/server_name api\.mi\.lan;\s+location \/ \{/);
  });
});

describe("caddy", () => {
  it("uses handle_path to strip and handle to keep, plain http", () => {
    const f = buildCaddyfile([r(), r({ name: "keep", path: "/keep", stripPath: false })]);
    expect(f).toContain("auto_https off");
    expect(f).toContain(":80 {");
    expect(f).toContain("handle_path /hola* {");
    expect(f).toContain("\thandle /keep* {");
    expect(f).toContain("reverse_proxy http://tunnel-extranet-to-intranet-80");
  });

  it("adds a site per domain", () => {
    const f = buildCaddyfile([r({ path: undefined, host: "api.mi.lan" })]);
    expect(f).toContain("http://api.mi.lan {");
    expect(f).not.toContain(":80 {");
  });
});

describe("haproxy", () => {
  it("routes by host and path, strips the prefix and resolves upstreams at run time", () => {
    const cfg = buildHaproxyConfig([
      r({
        name: "api",
        path: "/api",
        host: "api.lan",
        upstream: "http://svc:8080",
        stripPath: true,
      }),
      r({ name: "root", path: "/", upstream: "https://secure:443", stripPath: false }),
    ]);
    expect(cfg).toContain("acl host_api hdr(host),field(1,:) -i api.lan");
    expect(cfg).toContain("acl path_api path_beg /api");
    expect(cfg).toContain("use_backend be_api if host_api path_api");
    expect(cfg).toContain("use_backend be_root\n");
    expect(cfg).toContain("http-request set-path %[path,regsub(^/api/?,/)]");
    expect(cfg).toContain("server s1 svc:8080 resolvers docker init-addr none\n");
    expect(cfg).toContain(
      "server s1 secure:443 resolvers docker init-addr none ssl verify required",
    );
    expect(cfg).toContain("default_backend be_none");
  });

  it("refuses upstreams with a path", () => {
    expect(() => planGateway("haproxy", [r({ upstream: "http://svc:8080/base" })])).toThrow();
  });
});

describe("traefik", () => {
  it("builds routers, strip middlewares and services", () => {
    const y = parse(buildTraefikConfig([r({ host: "api.mi.lan" })]));
    expect(y.http.routers.hola).toEqual({
      rule: "Host(`api.mi.lan`) && PathPrefix(`/hola`)",
      entryPoints: ["web"],
      service: "hola",
      middlewares: ["hola-strip"],
    });
    expect(y.http.middlewares["hola-strip"]).toEqual({ stripPrefix: { prefixes: ["/hola"] } });
    expect(y.http.services.hola).toEqual({
      loadBalancer: { servers: [{ url: "http://tunnel-extranet-to-intranet-80" }] },
    });
  });

  it("omits the middleware when the prefix is kept", () => {
    expect(parse(buildTraefikConfig([r({ stripPath: false })])).http.middlewares).toBeUndefined();
  });
});

describe("planGateway", () => {
  it("picks the delivery mode per kind", () => {
    expect(planGateway("kong", [r()]).mode).toBe("kong");
    const nginx = planGateway("nginx", [r()]);
    expect(nginx).toMatchObject({
      mode: "files",
      files: [{ path: "/etc/nginx/conf.d/00-nautix.conf.new" }],
    });
    expect(planGateway("caddy", [r()])).toMatchObject({
      files: [{ path: "/etc/caddy/Caddyfile.new" }],
    });
    expect(planGateway("traefik", [r()])).toMatchObject({
      files: [{ path: "/etc/traefik/dynamic/nautix.yml" }],
      commands: [],
    });
  });

  it("validates before touching any gateway: nginx rejects configs it could not load, scripts hold no route data", () => {
    const plan = planGateway("nginx", [r({ path: "/x", name: "evil" })]);
    expect(plan.mode === "files" && plan.commands.flat().join(" ")).not.toContain("evil");
    expect(plan.mode === "files" && plan.commands.flat().join(" ")).toContain("nginx -t");
  });

  it("refuses upstreams with a path on proxy gateways and duplicate mappings everywhere", () => {
    for (const kind of ["nginx", "caddy", "traefik", "haproxy"] as const) {
      expect(() => planGateway(kind, [r({ upstream: "http://a:80/base" })])).toThrow(
        /without a path/,
      );
    }
    expect(() => planGateway("kong", [r({ upstream: "http://a:80/base" })])).not.toThrow();
    expect(() => planGateway("kong", [r(), r({ name: "other" })])).toThrow(/share/);
  });
});

describe("strategy registry", () => {
  it("has exactly one strategy per supported kind, each reporting its own kind", () => {
    for (const kind of supportedKinds()) expect(strategyFor(kind).kind).toBe(kind);
    expect(supportedKinds()).toEqual(["kong", "nginx", "caddy", "traefik", "haproxy"]);
  });
});

describe("allow lists (who can use a route)", () => {
  const guarded = r({ allow: ["10.0.0.0/24", "192.168.1.5"] });
  const open = r();

  it("nginx denies everyone else inside the location", () => {
    const conf = buildNginxConfig([guarded]);
    expect(conf).toMatch(
      /location \^~ \/hola \{\s+allow 10\.0\.0\.0\/24;\s+allow 192\.168\.1\.5;\s+deny all;/,
    );
    expect(buildNginxConfig([open])).not.toContain("deny all");
  });

  it("caddy answers 403 to sources outside the list", () => {
    const f = buildCaddyfile([guarded]);
    expect(f).toContain("@blocked not remote_ip 10.0.0.0/24 192.168.1.5");
    expect(f).toContain('respond @blocked "Forbidden" 403');
    expect(buildCaddyfile([open])).not.toContain("remote_ip");
  });

  it("traefik puts an ipAllowList middleware before the prefix strip", () => {
    const doc = parse(buildTraefikConfig([guarded])) as {
      http: {
        routers: Record<string, { middlewares?: string[] }>;
        middlewares: Record<string, unknown>;
      };
    };
    expect(doc.http.routers.hola?.middlewares).toEqual(["hola-allow", "hola-strip"]);
    expect(doc.http.middlewares["hola-allow"]).toEqual({
      ipAllowList: { sourceRange: ["10.0.0.0/24", "192.168.1.5"] },
    });
    const none = parse(buildTraefikConfig([open])) as {
      http: { middlewares: Record<string, unknown> };
    };
    expect(none.http.middlewares["hola-allow"]).toBeUndefined();
  });

  it("haproxy denies with 403 when the route matched and the source is not listed", () => {
    const cfg = buildHaproxyConfig([r({ allow: ["10.0.0.0/24"], host: "api.mi.lan" })]);
    expect(cfg).toContain("acl src_hola src 10.0.0.0/24");
    expect(cfg).toContain("http-request deny deny_status 403 if host_hola path_hola !src_hola");
    expect(cfg.indexOf("acl src_hola")).toBeLessThan(cfg.indexOf("use_backend be_hola"));
    expect(buildHaproxyConfig([open])).not.toContain("deny_status 403");
  });

  it("kong adds the ip-restriction plugin to the route", () => {
    const doc = parse(buildKongConfig([guarded])) as {
      services: { routes: { plugins?: { name: string; config: { allow: string[] } }[] }[] }[];
    };
    expect(doc.services[0]?.routes[0]?.plugins).toEqual([
      { name: "ip-restriction", config: { allow: ["10.0.0.0/24", "192.168.1.5"] } },
    ]);
  });

  it("rejects an invalid entry", () => {
    expect(() => r({ allow: ["10.0.0.0/33"] })).toThrow();
    expect(() => r({ allow: ["not-an-ip"] })).toThrow();
    expect(r({ allow: ["fd00::/8", "::1"] }).allow).toHaveLength(2);
  });
});
