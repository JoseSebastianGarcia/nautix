import {
  type Container,
  type CreateTunnel,
  type Network,
  TUNNEL_IMAGE,
  TUNNEL_LABEL,
} from "@nautix/contracts";
import { ConflictError, NotFoundError, ValidationError } from "../../../shared/domain-error.js";
import type { EngineContainerSpec } from "./container-spec.js";

export interface TunnelPlan {
  spec: EngineContainerSpec;
  /** The tunnel joins the source network at creation and the destination right after. */
  destination: Network;
}

const nameFor = (from: string, to: string, port: number): string =>
  `tunnel-${from}-to-${to}-${port}`.replace(/[^a-zA-Z0-9_.-]/g, "-").slice(0, 63);

/**
 * A tunnel is a tiny socat container attached to two networks that forwards one TCP port:
 * listen on `listenPort` in the source network → `target:targetPort` in the destination.
 * Everything else stays isolated; the tunnel publishes nothing to the host.
 */
export const planTunnel = (
  request: CreateTunnel,
  networks: Network[],
  containers: Container[],
): TunnelPlan => {
  const from = networks.find((n) => n.id === request.fromNetworkId);
  const to = networks.find((n) => n.id === request.toNetworkId);
  if (!from || !to) throw new NotFoundError("network not found", "errors.networkNotFound");
  if (from.system || to.system)
    throw new ValidationError(
      "tunnels connect user-defined networks",
      "errors.tunnelSystemNetwork",
    );
  if (from.id === to.id)
    throw new ValidationError("pick two different networks", "errors.tunnelSameNetwork");

  const target = containers.find((c) => c.id === request.targetContainerId);
  if (!target) throw new NotFoundError("container not found", "errors.notFound");
  if (target.labels[TUNNEL_LABEL] === "true")
    throw new ValidationError("cannot tunnel to a tunnel", "errors.tunnelToTunnel");
  if (!target.networks.includes(to.name)) {
    throw new ValidationError(
      "the target is not on the destination network",
      "errors.tunnelTargetNotOnNetwork",
    );
  }

  const listen = request.listenPort ?? request.targetPort;
  const name = nameFor(from.name, to.name, listen);
  if (containers.some((c) => c.name === name)) {
    throw new ConflictError("a tunnel with this listening port already exists", "errors.nameInUse");
  }

  const spec: EngineContainerSpec = {
    name,
    image: TUNNEL_IMAGE,
    env: [],
    labels: {
      "nautix.managed": "true",
      [TUNNEL_LABEL]: "true",
      "nautix.tunnel.from": from.name,
      "nautix.tunnel.to": to.name,
      "nautix.tunnel.target": `${target.name}:${request.targetPort}`,
      "nautix.tunnel.listen": String(listen),
    },
    // socat's entrypoint is `socat`; these are its arguments, no shell involved.
    cmd: [`TCP-LISTEN:${listen},fork,reuseaddr`, `TCP:${target.name}:${request.targetPort}`],
    exposedPorts: {},
    portBindings: {},
    binds: [],
    restartPolicy: "unless-stopped",
    networkName: from.name,
  };
  return { spec, destination: to };
};
