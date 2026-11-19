import { Queue } from "bullmq";
import { redis } from "./redis";

export const DEPLOY_QUEUE = "deploys";
export const OPS_QUEUE = "ops";

export type DeployJob = { deploymentId: string };
export type OpsJob =
  | { kind: "domain-check" }
  | { kind: "backup"; databaseId?: string }
  | { kind: "prune" }
  | { kind: "db-stats" }
  | { kind: "provision-db"; databaseId: string }
  | { kind: "restore"; backupId: string }
  | { kind: "standby"; projectId: string }
  | { kind: "start"; projectId: string }
  | { kind: "domain-sync"; projectId: string }
  | { kind: "teardown"; slug: string; hostnames: string[] }
  | { kind: "destroy-db"; containerName: string; volumeName: string; keepVolume: boolean };

const globalForQueues = globalThis as unknown as { unstakdQueues?: { deploy: Queue<DeployJob>; ops: Queue<OpsJob> } };

export function queues() {
  globalForQueues.unstakdQueues ??= {
    deploy: new Queue<DeployJob>(DEPLOY_QUEUE, { connection: redis(), defaultJobOptions: { removeOnComplete: 500, removeOnFail: 500 } }),
    ops: new Queue<OpsJob>(OPS_QUEUE, { connection: redis(), defaultJobOptions: { removeOnComplete: 200, removeOnFail: 200 } }),
  };
  return globalForQueues.unstakdQueues;
}

// Cancellation is cooperative: the worker checks this key between steps and while building.
export const cancelKey = (deploymentId: string) => `deploy:cancel:${deploymentId}`;
