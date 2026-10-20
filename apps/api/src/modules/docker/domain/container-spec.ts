import type { CreateContainer } from "@nautix/contracts";

const LOOPBACK = "127.0.0.1";
const PUBLIC = "0.0.0.0";

export interface EngineContainerSpec {
  name: string;
  image: string;
  env: string[];
  labels: Record<string, string>;
  cmd?: string[];
  exposedPorts: Record<string, Record<string, never>>;
  portBindings: Record<string, { HostIp: string; HostPort: string }[]>;
  binds: string[];
  restartPolicy: CreateContainer["restartPolicy"];
  /** Network the container joins at creation; undefined = engine default bridge. */
  networkName?: string;
}

/**
 * Builds the engine spec from a request.
 * Safety rule: a published port binds to 127.0.0.1 unless the caller explicitly
 * asks to expose it publicly. Nothing ever binds to 0.0.0.0 by accident.
 */
export const buildContainerSpec = (
  request: CreateContainer,
  networkName: string | undefined,
): EngineContainerSpec => {
  const exposedPorts: EngineContainerSpec["exposedPorts"] = {};
  const portBindings: EngineContainerSpec["portBindings"] = {};
  for (const port of request.ports) {
    const key = `${port.containerPort}/tcp`;
    exposedPorts[key] = {};
    portBindings[key] = [
      {
        HostIp: port.exposePublicly ? PUBLIC : LOOPBACK,
        HostPort: port.hostPort ? String(port.hostPort) : "",
      },
    ];
  }
  return {
    name: request.name,
    image: request.image,
    env: Object.entries(request.env).map(([k, v]) => `${k}=${v}`),
    labels: { ...request.labels, "nautix.managed": "true" },
    ...(request.command ? { cmd: request.command } : {}),
    exposedPorts,
    portBindings,
    binds: request.volumes,
    restartPolicy: request.restartPolicy,
    ...(networkName ? { networkName } : {}),
  };
};
