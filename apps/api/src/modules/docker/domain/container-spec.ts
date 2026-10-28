import { bindString, type CreateContainer } from "@nautix/contracts";

const LOOPBACK = "127.0.0.1";
const PUBLIC = "0.0.0.0";
const NS = 1_000_000_000;

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
  healthcheck?: {
    test: string[];
    intervalNs: number;
    timeoutNs: number;
    retries: number;
    startPeriodNs: number;
  };
  /** Fixed IPv4 on `networkName`. */
  ipv4Address?: string;
  memoryBytes?: number;
  nanoCpus?: number;
  /** Network the container joins at creation; undefined = engine default bridge. */
  networkName?: string;
}

/**
 * Builds the engine spec from a request.
 * Safety rule: a published port binds to 127.0.0.1 unless the caller explicitly
 * asks for another address or to expose it publicly. Nothing ever binds to 0.0.0.0 by accident.
 */
export const buildContainerSpec = (
  request: CreateContainer,
  networkName: string | undefined,
): EngineContainerSpec => {
  const exposedPorts: EngineContainerSpec["exposedPorts"] = {};
  const portBindings: EngineContainerSpec["portBindings"] = {};
  for (const port of request.ports) {
    const key = `${port.containerPort}/${port.protocol}`;
    exposedPorts[key] = {};
    portBindings[key] = [
      {
        HostIp: port.bindAddress ?? (port.exposePublicly ? PUBLIC : LOOPBACK),
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
    binds: [...request.volumes, ...request.mounts.map(bindString)],
    restartPolicy: request.restartPolicy,
    ...(request.healthcheck
      ? {
          healthcheck: {
            test: ["CMD-SHELL", request.healthcheck.command],
            intervalNs: request.healthcheck.intervalSeconds * NS,
            timeoutNs: request.healthcheck.timeoutSeconds * NS,
            retries: request.healthcheck.retries,
            startPeriodNs: request.healthcheck.startPeriodSeconds * NS,
          },
        }
      : {}),
    ...(request.ipAddress && networkName ? { ipv4Address: request.ipAddress } : {}),
    ...(request.limits?.memoryMb ? { memoryBytes: request.limits.memoryMb * 1024 * 1024 } : {}),
    ...(request.limits?.cpus ? { nanoCpus: Math.round(request.limits.cpus * 1e9) } : {}),
    ...(networkName ? { networkName } : {}),
  };
};
