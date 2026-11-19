import { describe, expect, it } from "vitest";
import { cpuPercent, memoryBytes } from "./metrics";

describe("container stats", () => {
  it("computes CPU like docker stats", () => {
    const st = {
      cpu_stats: { cpu_usage: { total_usage: 2_000_000 }, system_cpu_usage: 20_000_000, online_cpus: 4 },
      precpu_stats: { cpu_usage: { total_usage: 1_000_000 }, system_cpu_usage: 10_000_000 },
      memory_stats: {},
    };
    expect(cpuPercent(st)).toBeCloseTo(40);
  });
  it("is 0 without a previous sample", () => {
    const st = { cpu_stats: { cpu_usage: { total_usage: 5 } }, precpu_stats: { cpu_usage: { total_usage: 0 } }, memory_stats: {} };
    expect(cpuPercent(st)).toBe(0);
  });
  it("excludes page cache from memory", () => {
    expect(memoryBytes({ cpu_stats: { cpu_usage: { total_usage: 0 } }, precpu_stats: { cpu_usage: { total_usage: 0 } }, memory_stats: { usage: 300, stats: { inactive_file: 100 } } })).toBe(200);
  });
});
