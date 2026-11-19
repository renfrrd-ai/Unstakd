import { desc, eq, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import type { Deployment, Project } from "@/db/schema";
import { cancelKey, queues } from "@/lib/queue";
import { redis } from "@/lib/redis";
import { audit } from "./audit";

type NewDeploy = {
  trigger: Deployment["trigger"];
  commitSha?: string | null;
  commitMessage?: string | null;
  rollbackOf?: Deployment;
  previewPr?: number;
};

export async function createDeployment(project: Project, opts: NewDeploy): Promise<Deployment> {
  const deployment = await db().transaction(async (tx) => {
    // Serialise numbering per project.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${project.id}))`);
    const [last] = await tx
      .select({ number: s.deployments.number })
      .from(s.deployments)
      .where(eq(s.deployments.projectId, project.id))
      .orderBy(desc(s.deployments.number))
      .limit(1);
    const [row] = await tx
      .insert(s.deployments)
      .values({
        projectId: project.id,
        number: (last?.number ?? 0) + 1,
        trigger: opts.trigger,
        branch: project.branch,
        commitSha: opts.rollbackOf?.commitSha ?? opts.commitSha ?? null,
        commitMessage: opts.rollbackOf ? `rollback to #${opts.rollbackOf.number}` : (opts.commitMessage ?? null),
        imageTag: opts.rollbackOf?.imageTag ?? null,
        rollbackOf: opts.rollbackOf?.id ?? null,
        previewPr: opts.previewPr ?? null,
      })
      .returning();
    return row;
  });
  await queues().deploy.add("deploy", { deploymentId: deployment.id }, { jobId: deployment.id });
  if (opts.rollbackOf) await audit("deploy.rollback", project.name, { number: opts.rollbackOf.number });
  return deployment;
}

export async function cancelDeployment(deployment: Deployment) {
  if (deployment.status === "queued") {
    const job = await queues().deploy.getJob(deployment.id);
    await job?.remove().catch(() => {});
    await db()
      .update(s.deployments)
      .set({ status: "cancelled", finishedAt: new Date() })
      .where(eq(s.deployments.id, deployment.id));
    return;
  }
  await redis().set(cancelKey(deployment.id), "1", "EX", 3600);
}
