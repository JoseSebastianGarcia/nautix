import { z } from "zod";
import type { Container } from "./docker.js";
import { isIpAddress } from "./ip.js";
import { ApplyGate } from "./recreate.js";

/** Who can reach a published port: the address it is bound to on the host. */
export const Exposure = z.discriminatedUnion("kind", [
  /** 127.0.0.1: only the host itself. */
  z.object({ kind: z.literal("local") }),
  /** One address of the host, for example its LAN or VPN address. */
  z.object({
    kind: z.literal("address"),
    address: z.string().trim().refine(isIpAddress, "invalid IP address"),
  }),
  /** Every interface of the host. */
  z.object({ kind: z.literal("open") }),
]);
export type Exposure = z.infer<typeof Exposure>;

const LOOPBACK = new Set(["127.0.0.1", "::1"]);
const ANY = new Set(["", "0.0.0.0", "::"]);

/** Exposure from the host IP of a real port binding (what Docker reports), whoever created it. */
export const exposureOf = (hostIp: string | undefined): Exposure => {
  const ip = (hostIp ?? "").trim();
  if (ANY.has(ip)) return { kind: "open" };
  if (LOOPBACK.has(ip)) return { kind: "local" };
  return { kind: "address", address: ip };
};

/** Host IP to bind for an exposure. */
export const bindAddressOf = (exposure: Exposure): string =>
  exposure.kind === "local" ? "127.0.0.1" : exposure.kind === "open" ? "0.0.0.0" : exposure.address;

export const ChangeExposure = z.object({
  ports: z
    .array(
      z.object({
        containerPort: z.number().int().min(1).max(65535),
        protocol: z.enum(["tcp", "udp"]).default("tcp"),
        exposure: Exposure,
      }),
    )
    .min(1)
    .max(100),
  gate: ApplyGate.optional(),
});
export type ChangeExposure = z.infer<typeof ChangeExposure>;

export interface ExposureEntry {
  containerId: string;
  container: string;
  state: string;
  hostPort: number;
  containerPort: number;
  protocol: string;
  hostIp: string;
  exposure: Exposure;
  /** The container is Nautix itself (it cannot be recreated from here). */
  isSelf: boolean;
}

/** Every published port with who can reach it: open ones first, so none is hidden. */
export const exposureInventory = (
  containers: Pick<Container, "id" | "name" | "state" | "ports" | "isSelf">[],
): ExposureEntry[] => {
  const order = { open: 0, address: 1, local: 2 } as const;
  return containers
    .flatMap((c) =>
      c.ports
        .filter((p) => p.publicPort !== undefined)
        .map((p) => ({
          containerId: c.id,
          container: c.name,
          state: c.state,
          hostPort: p.publicPort as number,
          containerPort: p.privatePort,
          protocol: p.type,
          hostIp: p.ip ?? "",
          exposure: exposureOf(p.ip),
          isSelf: c.isSelf === true,
        })),
    )
    .sort(
      (a, b) =>
        order[a.exposure.kind] - order[b.exposure.kind] ||
        a.container.localeCompare(b.container) ||
        a.hostPort - b.hostPort,
    );
};
