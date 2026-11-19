import { db, schema as s } from "@/db";

export async function audit(action: string, target: string, details?: Record<string, unknown>) {
  await db().insert(s.auditEvents).values({ action, target, details });
}
