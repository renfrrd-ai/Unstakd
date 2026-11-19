import { sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { encrypt } from "@/lib/crypto";

export async function upsertEnv(projectId: string, entries: [string, string][], secret: boolean) {
  if (entries.length === 0) return;
  await db()
    .insert(s.envVars)
    .values(entries.map(([key, value]) => ({ projectId, key, valueEnc: encrypt(value), secret })))
    .onConflictDoUpdate({
      target: [s.envVars.projectId, s.envVars.key],
      set: { valueEnc: sql`excluded.value_enc`, secret: sql`excluded.secret`, updatedAt: new Date() },
    });
}
