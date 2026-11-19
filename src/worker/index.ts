import { Queue, Worker } from "bullmq";
import { DEPLOY_QUEUE, OPS_QUEUE, type DeployJob, type OpsJob } from "@/lib/queue";
import { createRedis } from "@/lib/redis";
import { reconcileRoutes } from "./housekeeping";
import { handleOps } from "./ops";

const concurrency = Number(process.env.BUILD_CONCURRENCY ?? 1);

const ops = new Worker<OpsJob>(OPS_QUEUE, handleOps, { connection: createRedis(), concurrency: 4 });

const deploys = new Worker<DeployJob>(
  DEPLOY_QUEUE,
  async (job) => {
    const { runDeploy } = await import("./deploy");
    await runDeploy(job.data.deploymentId);
  },
  { connection: createRedis(), concurrency, lockDuration: 60_000 },
);

for (const [name, w] of [["ops", ops], ["deploys", deploys]] as const) {
  w.on("failed", (job, err) => console.error(`[${name}] ${job?.name} ${job?.id} failed: ${err.message}`));
  w.on("completed", (job) => console.log(`[${name}] ${job.name} ${job.id} done`));
}

const scheduler = new Queue<OpsJob>(OPS_QUEUE, { connection: createRedis() });
await scheduler.upsertJobScheduler("db-stats", { every: 5 * 60_000 }, { name: "db-stats", data: { kind: "db-stats" } });
await scheduler.upsertJobScheduler("prune", { pattern: "0 4 * * *", tz: process.env.TZ ?? "America/Toronto" }, { name: "prune", data: { kind: "prune" } });
await reconcileRoutes((l) => console.log(`[startup] ${l}`)).catch((e) => console.error(`[startup] route reconcile failed: ${e.message}`));
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
