import { and, eq } from "drizzle-orm";
import type { Job } from "bullmq";
import { db, schema as s } from "@/db";
import type { OpsJob } from "@/lib/queue";
import { audit } from "@/server/audit";
import { backupDatabase, pruneBackups, restoreDatabase } from "@/server/backups";
import { destroyDatabase, provisionDatabase, recordUsage } from "@/server/databases";

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
    case "destroy-db":
      await destroyDatabase(data.containerName, data.volumeName, { keepVolume: data.keepVolume });
      return;
    default:
      throw new Error(`ops job "${data.kind}" is not supported by this worker yet`);
  }
}
