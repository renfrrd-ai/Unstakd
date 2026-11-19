"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { db, schema as s } from "@/db";
import { queues } from "@/lib/queue";
import { audit } from "@/server/audit";
import { connectionUrl } from "@/server/db-connection";
import { requireUser } from "@/server/session";

const id = z.string().uuid();

async function load(rawId: string) {
  await requireUser();
  const [row] = await db().select().from(s.databases).where(eq(s.databases.id, id.parse(rawId)));
  if (!row) throw new Error("Database not found");
  return row;
}

export async function revealConnection(rawId: string) {
  const row = await load(rawId);
  await audit("database.revealed", row.name);
  return connectionUrl(row);
}

export async function backupNow(rawId: string) {
  const row = await load(rawId);
  await queues().ops.add("backup", { kind: "backup", databaseId: row.id });
  refresh();
}

export async function restoreBackup(rawBackupId: string) {
  await requireUser();
  const backupId = id.parse(rawBackupId);
  await queues().ops.add("restore", { kind: "restore", backupId });
  refresh();
}
