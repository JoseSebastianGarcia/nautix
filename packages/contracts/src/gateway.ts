import { z } from "zod";

/** Helper image that talks to the gateway's admin API from inside its network. */
export const GATEWAY_HELPER_IMAGE = "curlimages/curl:8.22.0";

const Hostname = z
  .string()
  .max(253)
  .regex(
    /^(\*\.)?([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/,
    "invalid host",
  );

const Upstream = z
  .string()
  .max(512)
  .refine((v) => {
    try {
      const u = new URL(v);
      return (
        (u.protocol === "http:" || u.protocol === "https:") &&
        u.username === "" &&
        u.password === "" &&
        u.hostname !== ""
      );
    } catch {
      return false;
    }
  }, "upstream must be an http(s) URL without credentials");

/** One mapping: requests matching `path` and/or `host` are forwarded to `upstream`. */
export const GatewayRoute = z
  .object({
    name: z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/, "lowercase letters, numbers and dashes"),
    path: z
      .string()
      .max(255)
      .regex(/^\/[A-Za-z0-9._~\-/%]*$/, "must start with / and contain no spaces")
      .optional(),
    /** Optional virtual host (custom domain), e.g. api.mi.lan. */
    host: Hostname.optional(),
    upstream: Upstream,
    /** Remove the matched path prefix before forwarding (/hola/x → /x). */
    stripPath: z.boolean().default(true),
  })
  .refine((r) => r.path !== undefined || r.host !== undefined, {
    message: "a route needs a path or a host",
  });
export type GatewayRoute = z.infer<typeof GatewayRoute>;

export const SaveGatewayRoutes = z.object({
  routes: z
    .array(GatewayRoute)
    .max(200)
    .refine((rs) => new Set(rs.map((r) => r.name)).size === rs.length, {
      message: "route names must be unique",
    }),
});
export type SaveGatewayRoutes = z.infer<typeof SaveGatewayRoutes>;

export const GatewayApplyResult = z.object({ ok: z.boolean(), output: z.string() });
export type GatewayApplyResult = z.infer<typeof GatewayApplyResult>;

/** Gateways Nautix knows how to configure (detected from the image name). */
export const isKongImage = (image: string): boolean =>
  /(^|\/)kong(-gateway)?(:|$|@|\/)/.test(image.toLowerCase());
