import { Queue, Worker } from "bullmq";
import { publishChange } from "@/lib/changes";
import { DEPLOY_QUEUE, OPS_QUEUE, type DeployJob, type OpsJob } from "@/lib/queue";
import { createRedis } from "@/lib/redis";
import { removeContainer } from "@/server/docker";
import { reconcileRoutes, recoverInterrupted } from "./housekeeping";
import { handleOps } from "./ops";

const concurrency = Number(process.env.BUILD_CONCURRENCY ?? 1);

// Workers start paused (autorun: false) so startup recovery can't race a job that just began.
const ops = new Worker<OpsJob>(OPS_QUEUE, handleOps, { connection: createRedis(), concurrency: 4, autorun: false });

const deploys = new Worker<DeployJob>(
  DEPLOY_QUEUE,
  async (job) => {
    const { runDeploy } = await import("./deploy");
    await runDeploy(job.data.deploymentId);
  },
  { connection: createRedis(), concurrency, lockDuration: 60_000, autorun: false },
);

// Scheduled housekeeping runs every minute or so; it only matters to open pages once it has finished.
const quiet = new Set(["app-stats", "db-stats", "domain-check", "prune"]);
for (const [name, w] of [["ops", ops], ["deploys", deploys]] as const) {
  w.on("active", (job) => {
    if (!quiet.has(job.name)) void publishChange(job.name);
  });
  w.on("failed", (job, err) => {
    console.error(`[${name}] ${job?.name} ${job?.id} failed: ${err.message}`);
    void publishChange(job?.name ?? name);
  });
  w.on("completed", (job) => {
    console.log(`[${name}] ${job.name} ${job.id} done`);
    void publishChange(job.name);
  });
}

const scheduler = new Queue<OpsJob>(OPS_QUEUE, { connection: createRedis() });
await scheduler.upsertJobScheduler("app-stats", { every: 60_000 }, { name: "app-stats", data: { kind: "app-stats" } });
await scheduler.upsertJobScheduler("db-stats", { every: 5 * 60_000 }, { name: "db-stats", data: { kind: "db-stats" } });
await scheduler.upsertJobScheduler("prune", { pattern: "0 4 * * *", tz: process.env.TZ ?? "America/Toronto" }, { name: "prune", data: { kind: "prune" } });
const startup = (l: string) => console.log(`[startup] ${l}`);
const orphans = await recoverInterrupted(startup).catch((e) => {
  console.error(`[startup] recovery failed: ${e.message}`);
  return [] as string[];
});
await reconcileRoutes(startup).catch((e) => console.error(`[startup] route reconcile failed: ${e.message}`));
// Routes point at the live deploys again, so the half-started containers can go.
for (const name of orphans) await removeContainer(name).catch(() => {});
void ops.run();
void deploys.run();
await scheduler.upsertJobScheduler("domain-check", { every: 60_000 }, { name: "domain-check", data: { kind: "domain-check" } });
await scheduler.upsertJobScheduler(
  "nightly-backup",
  { pattern: process.env.BACKUP_CRON ?? "0 3 * * *", tz: process.env.TZ ?? "America/Toronto" },
  { name: "backup", data: { kind: "backup" } },
);

console.log(`unstakd worker up (build concurrency ${concurrency})`);

async function shutdown() {
  await Promise.all([ops.close(), deploys.close(), scheduler.close()]);
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
