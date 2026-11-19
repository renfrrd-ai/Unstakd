import "server-only";
import { readFile, statfs } from "node:fs/promises";
import os from "node:os";

const GB = 1024 ** 3;

async function cpuPercent(sampleMs = 200): Promise<number> {
  const snap = () => os.cpus().reduce((a, c) => {
    const t = c.times;
    a.idle += t.idle;
    a.total += t.idle + t.user + t.nice + t.sys + t.irq;
    return a;
  }, { idle: 0, total: 0 });
  const a = snap();
  await new Promise((r) => setTimeout(r, sampleMs));
  const b = snap();
  const total = b.total - a.total;
  return total > 0 ? 100 * (1 - (b.idle - a.idle) / total) : 0;
}

// os.freemem() counts page cache as used; MemAvailable is what apps can actually get.
async function availableMem(): Promise<number> {
  try {
    const info = await readFile("/proc/meminfo", "utf8");
    const kb = Number(/^MemAvailable:\s+(\d+)/m.exec(info)?.[1]);
    if (kb) return kb * 1024;
  } catch {}
  return os.freemem();
}

export async function hostStats() {
  const [cpu, disk, memFree] = await Promise.all([cpuPercent(), statfs("/"), availableMem()]);
  const memTotal = os.totalmem();
  const memUsed = memTotal - memFree;
  const diskTotal = disk.blocks * disk.bsize;
  const diskUsed = diskTotal - disk.bavail * disk.bsize;
  return {
    hostname: os.hostname(),
    cpu: Math.round(cpu),
    memUsedGb: memUsed / GB,
    memTotalGb: memTotal / GB,
    diskUsedGb: diskUsed / GB,
    diskTotalGb: diskTotal / GB,
  };
}
