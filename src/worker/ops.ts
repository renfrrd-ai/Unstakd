import { eq } from "drizzle-orm";
import type { Job } from "bullmq";
import { db, schema as s } from "@/db";
import type { OpsJob } from "@/lib/queue";
import { audit } from "@/server/audit";
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
