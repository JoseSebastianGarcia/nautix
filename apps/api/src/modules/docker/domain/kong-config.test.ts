import { GatewayRoute, isKongImage, SaveGatewayRoutes } from "@nautix/contracts";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { buildKongConfig } from "./kong-config.js";

const route = (over: Record<string, unknown> = {}) =>
  GatewayRoute.parse({
    name: "hola",
    path: "/hola",
    upstream: "http://tunnel-extranet-to-intranet-80:80",
    ...over,
  });

describe("buildKongConfig", () => {
  it("builds one service and route per mapping", () => {
    const doc = parse(
      buildKongConfig([
        route(),
        route({
          name: "api",
          path: undefined,
          host: "api.mi.lan",
          upstream: "https://svc:8443",
          stripPath: false,
        }),
      ]),
    );
    expect(doc._format_version).toBe("3.0");
    expect(doc.services).toEqual([
      {
        name: "hola",
        url: "http://tunnel-extranet-to-intranet-80:80",
        routes: [{ name: "hola", paths: ["/hola"], strip_path: true }],
      },
      {
        name: "api",
        url: "https://svc:8443",
        routes: [{ name: "api", hosts: ["api.mi.lan"], strip_path: false }],
      },
    ]);
  });

  it("is a valid empty config when there are no routes", () => {
    expect(parse(buildKongConfig([]))).toEqual({ _format_version: "3.0", services: [] });
  });
});

describe("route validation", () => {
  it("needs a path or a host", () => {
    expect(() => GatewayRoute.parse({ name: "x", upstream: "http://a:1" })).toThrow();
    expect(route({ path: undefined, host: "a.lan" }).host).toBe("a.lan");
  });

  it("rejects bad names, paths, hosts and upstreams", () => {
    for (const bad of [
      { name: "Bad Name" },
      { path: "no-slash" },
      { path: "/has space" },
      { host: "bad host!" },
      { upstream: "ftp://x" },
      { upstream: "not a url" },
      { upstream: "http://user:pw@host" },
    ]) {
      expect(() => route(bad)).toThrow();
    }
  });

  it("rejects duplicate route names", () => {
    expect(() => SaveGatewayRoutes.parse({ routes: [route(), route()] })).toThrow();
  });

  it("recognises Kong images", () => {
    expect(isKongImage("kong:3.7")).toBe(true);
    expect(isKongImage("docker.io/library/kong")).toBe(true);
    expect(isKongImage("kong/kong-gateway:3.7")).toBe(true);
    expect(isKongImage("nginx:1.27")).toBe(false);
    expect(isKongImage("mykongfu:1")).toBe(false);
  });
});
