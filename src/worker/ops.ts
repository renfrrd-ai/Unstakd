import { and, eq } from "drizzle-orm";
import type { Job } from "bullmq";
import { db, schema as s } from "@/db";
import type { OpsJob } from "@/lib/queue";
import { audit } from "@/server/audit";
import { backupDatabase, backupPlatform, pruneBackups, restoreDatabase } from "@/server/backups";
import { removeRoute, setRoute } from "@/server/caddy";
import { destroyDatabase, provisionDatabase, recordUsage } from "@/server/databases";
import { docker, LABEL, removeContainer, startContainer, stopContainer } from "@/server/docker";
import { routeHosts } from "./deploy";
import { checkDomains } from "./domains";
import { prune } from "./housekeeping";

export async function handleOps(job: Job<OpsJob>) {
  const data = job.data;
  const log = (line: string) => void job.log(line);

  switch (data.kind) {
    case "provision-db": {
      const [row] = await db().select().from(s.databases).where(eq(s.databases.id, data.databaseId));
      if (!row) return;
      const ok = await provisionDatabase(row, log);
      await audit(ok ? "database.created" : "database.failed", row.name, { engine: `${row.engine} ${row.version}` });
      if (!ok) throw new Error(`${row.name} did not become ready`);
      return;
    }
    case "backup": {
      const rows = data.databaseId
        ? await db().select().from(s.databases).where(eq(s.databases.id, data.databaseId))
        : await db().select().from(s.databases).where(and(eq(s.databases.status, "running"), eq(s.databases.backupsEnabled, true)));
      const failed: string[] = [];
      for (const row of rows) {
        try {
          const b = await backupDatabase(row);
          log(`${row.name}: ${b.sizeBytes} bytes`);
        } catch (e) {
          failed.push(row.name);
          await audit("backup.failed", row.name, { error: (e as Error).message.slice(0, 200) });
        }
      }
      if (!data.databaseId) {
        try {
          const platform = await backupPlatform();
          if (platform) log(`platform database: ${platform.size} bytes → ${platform.key}`);
        } catch (e) {
          failed.push("platform");
          await audit("backup.failed", "platform database", { error: (e as Error).message.slice(0, 200) });
        }
      }
      const pruned = await pruneBackups(data.databaseId);
      if (rows.length - failed.length > 0) {
        const target = data.databaseId ? rows[0].name : `${rows.length - failed.length} database${rows.length - failed.length === 1 ? "" : "s"}`;
        await audit("backup.completed", target, { destination: process.env.R2_BUCKET ? "R2" : "local disk", pruned });
      }
      if (failed.length) throw new Error(`backup failed for ${failed.join(", ")}`);
      return;
    }
    case "restore": {
      const [backup] = await db().select().from(s.backups).where(eq(s.backups.id, data.backupId));
      if (!backup) return;
      const [row] = await db().select().from(s.databases).where(eq(s.databases.id, backup.databaseId));
      if (!row) return;
      await restoreDatabase(row, backup);
      await audit("backup.restored", row.name, { from: backup.createdAt.toISOString() });
      return;
    }
    case "db-stats": {
      const rows = await db().select().from(s.databases).where(eq(s.databases.status, "running"));
      for (const row of rows) await recordUsage(row);
      return;
    }
    case "prune":
      await prune(log);
      return;
    case "domain-check":
      await checkDomains(log);
      return;
    case "stop-container": {
      // Only stop it if it's no longer the live container of its project.
      const live = await db().select({ id: s.deployments.id }).from(s.deployments).where(and(eq(s.deployments.containerName, data.containerName), eq(s.deployments.status, "live")));
      if (live.length === 0) await removeContainer(data.containerName);
      return;
    }
    case "standby":
    case "start": {
      const [project] = await db().select().from(s.projects).where(eq(s.projects.id, data.projectId));
      if (!project?.liveDeploymentId) return;
      const [live] = await db().select().from(s.deployments).where(eq(s.deployments.id, project.liveDeploymentId));
      if (!live?.containerName) return;
      if (data.kind === "standby") {
        await stopContainer(live.containerName);
        await removeRoute(project.slug);
      } else {
        await startContainer(live.containerName);
        await setRoute(project.slug, await routeHosts(project), `${live.containerName}:${project.port}`);
      }
      return;
    }
    case "domain-sync": {
      const [project] = await db().select().from(s.projects).where(eq(s.projects.id, data.projectId));
      if (!project?.liveDeploymentId || project.state !== "active") return;
      const [live] = await db().select().from(s.deployments).where(eq(s.deployments.id, project.liveDeploymentId));
      if (live?.containerName) await setRoute(project.slug, await routeHosts(project), `${live.containerName}:${project.port}`);
      return;
    }
    case "teardown": {
      await removeRoute(data.slug);
      const containers = await docker().listContainers({ all: true, filters: { label: [`${LABEL}.project=${data.slug}`] } });
      for (const c of containers) await removeContainer(c.Id);
      const images = await docker().listImages({ filters: { reference: [`unstakd/${data.slug}`] } });
      for (const img of images) await docker().getImage(img.Id).remove({ force: true }).catch(() => {});
      return;
    }
    case "destroy-db":
      await destroyDatabase(data.containerName, data.volumeName, { keepVolume: data.keepVolume });
      return;
    default: {
      const unknown: never = data;
      throw new Error(`unknown ops job ${JSON.stringify(unknown)}`);
    }
  }
}
