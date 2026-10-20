import { GatewayRoute } from "@nautix/contracts";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { planGateway } from "./gateway-plan.js";
import { buildCaddyfile } from "./gateway-strategies/caddy.strategy.js";
import { strategyFor, supportedKinds } from "./gateway-strategies/index.js";
import { buildNginxConfig } from "./gateway-strategies/nginx.strategy.js";
import { buildTraefikConfig } from "./gateway-strategies/traefik.strategy.js";

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
    for (const kind of ["nginx", "caddy", "traefik"] as const) {
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
    expect(supportedKinds()).toEqual(["kong", "nginx", "caddy", "traefik"]);
  });
});
