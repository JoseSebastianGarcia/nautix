import { describe, expect, it } from "vitest";
import { computeStats } from "./container-stats.js";

describe("computeStats", () => {
  it("computes CPU% from two samples and memory without cache", () => {
    const s = computeStats({
      cpu_stats: { cpu_usage: { total_usage: 300 }, system_cpu_usage: 2000, online_cpus: 4 },
      precpu_stats: { cpu_usage: { total_usage: 100 }, system_cpu_usage: 1000 },
      memory_stats: { usage: 1000, limit: 4000, stats: { inactive_file: 200 } },
      networks: { eth0: { rx_bytes: 10, tx_bytes: 5 }, eth1: { rx_bytes: 1, tx_bytes: 2 } },
      pids_stats: { current: 7 },
    });
    expect(s).toEqual({
      cpuPercent: 80,
      memoryBytes: 800,
      memoryLimitBytes: 4000,
      networkRxBytes: 11,
      networkTxBytes: 7,
      pids: 7,
    });
  });

  it("is safe on empty or first samples", () => {
    expect(computeStats({})).toEqual({
      cpuPercent: 0,
      memoryBytes: 0,
      memoryLimitBytes: 0,
      networkRxBytes: 0,
      networkTxBytes: 0,
      pids: 0,
    });
  });
});
