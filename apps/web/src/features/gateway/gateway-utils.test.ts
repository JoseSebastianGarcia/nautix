import type { Container } from "@nautix/contracts";
import { describe, expect, it } from "vitest";
import {
  blankRoute,
  candidatesFor,
  fromDraft,
  gateways,
  kindOf,
  publishedPort,
  toDraft,
  trafficPort,
  upstreamFor,
} from "./gateway-utils.js";

const c = (
  name: string,
  image: string,
  networks: string[],
  over: Partial<Container> = {},
): Container => ({
  id: name,
  name,
  image,
  state: "running",
  status: "",
  createdAt: 0,
  ports: [],
  networks,
  labels: {},
  ...over,
});

const kong = c("kong", "kong:3.7", ["extranet"], {
  ports: [{ ip: "127.0.0.1", privatePort: 8000, publicPort: 8000, type: "tcp" }],
});
const tunnel = c(
  "tunnel-extranet-to-intranet-80",
  "alpine/socat:1.8.1.1",
  ["extranet", "intranet"],
  {
    labels: {
      "nautix.tunnel": "true",
      "nautix.tunnel.from": "extranet",
      "nautix.tunnel.to": "intranet",
      "nautix.tunnel.target": "hola-mundo:80",
      "nautix.tunnel.listen": "80",
    },
  },
);
const web = c("web", "nginx", ["extranet"], {
  ports: [
    { privatePort: 80, type: "tcp" },
    { privatePort: 443, type: "tcp" },
  ],
});
const hidden = c("hola-mundo", "nginx", ["intranet"]);

describe("gateway utils", () => {
  it("finds every supported gateway or proxy, but not tunnels or other images", () => {
    const caddy = c("edge", "caddy:2-alpine", ["extranet"]);
    const db = c("db", "postgres:16", ["extranet"]);
    expect(gateways([kong, tunnel, web, caddy, db]).map((g) => g.name)).toEqual([
      "kong",
      "web",
      "edge",
    ]);
    expect(kindOf(caddy)).toBe("caddy");
    expect(kindOf(db)).toBeNull();
  });

  it("finds the published traffic port by kind (8000 for Kong, 80 for proxies)", () => {
    expect(trafficPort(kong)).toBe(8000);
    const proxy = c("p", "traefik:v3.1", ["x"], {
      ports: [{ ip: "127.0.0.1", privatePort: 80, publicPort: 8080, type: "tcp" }],
    });
    expect(trafficPort(proxy)).toBe(8080);
    expect(trafficPort(web)).toBeNull();
  });

  it("offers only services the gateway shares a network with, tunnels described by their target", () => {
    const list = candidatesFor(kong, [kong, tunnel, web, hidden]);
    expect(list.map((x) => x.label)).toEqual([
      "tunnel-extranet-to-intranet-80 → hola-mundo:80 (intranet)",
      "web:80",
      "web:443",
    ]);
    expect(upstreamFor(list[0] as never)).toBe("http://tunnel-extranet-to-intranet-80:80");
  });

  it("defaults to port 80 when a service exposes none", () => {
    expect(upstreamFor({ name: "x", port: null, label: "x" })).toBe("http://x:80");
  });

  it("reads the published proxy port", () => {
    expect(publishedPort(kong, 8000)).toBe(8000);
    expect(publishedPort(kong, 8001)).toBeNull();
  });

  it("converts drafts to routes, omitting empty fields, and back", () => {
    const draft = {
      name: " hola ",
      path: "/hola",
      host: "",
      upstream: " http://a:1 ",
      stripPath: true,
      allow: "10.0.0.0/24, 192.168.1.5\n::1",
    };
    expect(fromDraft(draft)).toEqual({
      name: "hola",
      path: "/hola",
      upstream: "http://a:1",
      stripPath: true,
      allow: ["10.0.0.0/24", "192.168.1.5", "::1"],
    });
    expect(
      toDraft({
        name: "r",
        host: "a.lan",
        upstream: "http://a:1",
        stripPath: false,
        allow: ["10.0.0.0/8"],
      }),
    ).toEqual({
      name: "r",
      path: "",
      host: "a.lan",
      upstream: "http://a:1",
      stripPath: false,
      allow: "10.0.0.0/8",
    });
  });

  it("makes unique names for new rows", () => {
    const first = blankRoute([]);
    expect(first.name).toBe("ruta-1");
    expect(blankRoute([first]).name).toBe("ruta-2");
  });
});
