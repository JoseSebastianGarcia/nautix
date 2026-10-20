import { z } from "zod";
import type { Container } from "./docker.js";

/** Label that marks a container as a Nautix tunnel (a port forwarder between two networks). */
export const TUNNEL_LABEL = "nautix.tunnel";
/** Pinned socat image used as the forwarder. */
export const TUNNEL_IMAGE = "alpine/socat:1.8.1.1";

export const CreateTunnel = z.object({
  fromNetworkId: z.string().min(1),
  toNetworkId: z.string().min(1),
  /** A container on the destination network; its port is what becomes reachable. */
  targetContainerId: z.string().min(1),
  targetPort: z.number().int().min(1).max(65535),
  /** Port the tunnel listens on inside the source network; defaults to targetPort. */
  listenPort: z.number().int().min(1).max(65535).optional(),
});
export type CreateTunnel = z.infer<typeof CreateTunnel>;

export interface TunnelInfo {
  containerId: string;
  name: string;
  from: string;
  to: string;
  targetName: string;
  targetPort: number;
  listenPort: number;
}

/** Reads a tunnel's description back from its labels; null for any other container. */
export const tunnelFromContainer = (c: Container): TunnelInfo | null => {
  if (c.labels[TUNNEL_LABEL] !== "true") return null;
  const from = c.labels["nautix.tunnel.from"];
  const to = c.labels["nautix.tunnel.to"];
  const target = c.labels["nautix.tunnel.target"];
  const listen = Number(c.labels["nautix.tunnel.listen"]);
  if (!from || !to || !target || !Number.isInteger(listen)) return null;
  const sep = target.lastIndexOf(":");
  const targetPort = Number(target.slice(sep + 1));
  if (sep < 1 || !Number.isInteger(targetPort)) return null;
  return {
    containerId: c.id,
    name: c.name,
    from,
    to,
    targetName: target.slice(0, sep),
    targetPort,
    listenPort: listen,
  };
};
