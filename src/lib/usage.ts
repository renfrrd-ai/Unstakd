// Container CPU is sampled as % of one core; an app's allocation is `cpuLimit` cores.
export function cpuOfAllocation(cpuPct: number | null | undefined, cpuLimit: number): number | null {
  if (cpuPct == null || cpuLimit <= 0) return null;
  return cpuPct / cpuLimit;
}

export function vcpu(n: number) {
  return `${Number.isInteger(n) ? n : n.toFixed(n * 4 === Math.round(n * 4) ? 2 : 1).replace(/0$/, "")} vCPU`;
}
