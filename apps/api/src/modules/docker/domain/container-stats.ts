import type { ContainerStats } from "@nautix/contracts";

interface RawStats {
  cpu_stats?: {
    cpu_usage?: { total_usage?: number };
    system_cpu_usage?: number;
    online_cpus?: number;
  };
  precpu_stats?: { cpu_usage?: { total_usage?: number }; system_cpu_usage?: number };
  memory_stats?: { usage?: number; limit?: number; stats?: Record<string, number> };
  networks?: Record<string, { rx_bytes?: number; tx_bytes?: number }>;
  pids_stats?: { current?: number };
}

/** Same formulas as `docker stats`: CPU from the delta between two samples, memory without page cache. */
export const computeStats = (raw: RawStats): ContainerStats => {
  const cpuDelta =
    (raw.cpu_stats?.cpu_usage?.total_usage ?? 0) - (raw.precpu_stats?.cpu_usage?.total_usage ?? 0);
  const systemDelta =
    (raw.cpu_stats?.system_cpu_usage ?? 0) - (raw.precpu_stats?.system_cpu_usage ?? 0);
  const cpus = raw.cpu_stats?.online_cpus ?? 1;
  const cpuPercent = systemDelta > 0 && cpuDelta > 0 ? (cpuDelta / systemDelta) * cpus * 100 : 0;

  const cache = raw.memory_stats?.stats?.inactive_file ?? raw.memory_stats?.stats?.cache ?? 0;
  const memoryBytes = Math.max(0, (raw.memory_stats?.usage ?? 0) - cache);

  const nets = Object.values(raw.networks ?? {});
  return {
    cpuPercent: Math.round(cpuPercent * 100) / 100,
    memoryBytes,
    memoryLimitBytes: raw.memory_stats?.limit ?? 0,
    networkRxBytes: nets.reduce((n, x) => n + (x.rx_bytes ?? 0), 0),
    networkTxBytes: nets.reduce((n, x) => n + (x.tx_bytes ?? 0), 0),
    pids: raw.pids_stats?.current ?? 0,
  };
};
