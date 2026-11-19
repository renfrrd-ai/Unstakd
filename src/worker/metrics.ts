import { and, eq, isNotNull, lt } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { docker } from "@/server/docker";

type Stats = {
  cpu_stats: { cpu_usage: { total_usage: number }; system_cpu_usage?: number; online_cpus?: number };
  precpu_stats: { cpu_usage: { total_usage: number }; system_cpu_usage?: number };
  memory_stats: { usage?: number; stats?: { inactive_file?: number; total_inactive_file?: number } };
};

// Same formula as `docker stats`: share of the host's CPU time, scaled by online CPUs.
export function cpuPercent(st: Stats) {
  const cpu = st.cpu_stats.cpu_usage.total_usage - st.precpu_stats.cpu_usage.total_usage;
  const sys = (st.cpu_stats.system_cpu_usage ?? 0) - (st.precpu_stats.system_cpu_usage ?? 0);
  const cpus = st.cpu_stats.online_cpus ?? 1;
  return sys > 0 && cpu > 0 ? (cpu / sys) * cpus * 100 : 0;
}

export function memoryBytes(st: Stats) {
  const cache = st.memory_stats.stats?.inactive_file ?? st.memory_stats.stats?.total_inactive_file ?? 0;
  return Math.max(0, (st.memory_stats.usage ?? 0) - cache);
}

export async function sampleAppMetrics() {
  const projects = await db().select().from(s.projects).where(and(isNotNull(s.projects.liveDeploymentId), eq(s.projects.state, "active")));
  const rows: (typeof s.appMetrics.$inferInsert)[] = [];
  for (const p of projects) {
    const [live] = await db().select({ name: s.deployments.containerName }).from(s.deployments).where(eq(s.deployments.id, p.liveDeploymentId!));
    if (!live?.name) continue;
    try {
      const c = docker().getContainer(live.name);
      const [stats, info] = await Promise.all([c.stats({ stream: false }) as unknown as Promise<Stats>, c.inspect()]);
      if (!info.State.Running) continue;
      rows.push({ projectId: p.id, cpuPct: Math.round(cpuPercent(stats) * 10) / 10, memBytes: memoryBytes(stats), restarts: info.RestartCount });
    } catch {
      // Container gone (e.g. mid-redeploy); skip this minute.
    }
  }
  if (rows.length) await db().insert(s.appMetrics).values(rows);
  await db().delete(s.appMetrics).where(lt(s.appMetrics.at, new Date(Date.now() - 7 * 24 * 3600 * 1000)));
  return rows.length;
}
