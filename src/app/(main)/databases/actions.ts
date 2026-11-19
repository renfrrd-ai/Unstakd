"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { z } from "zod";
import { db, schema as s } from "@/db";
import { queues } from "@/lib/queue";
import { slugSchema, type FormState } from "@/lib/validation";
import { ENGINES, insertDatabase, nextLocalPort, type Engine } from "@/server/database-catalog";
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

const create = z.object({
  name: slugSchema,
  engine: z.enum(["postgres", "redis"]),
  version: z.string(),
  backups: z.literal("on").optional(),
  project: z.string().optional(),
});

export async function createDatabase(_prev: FormState, data: FormData): Promise<FormState> {
  await requireUser();
  const parsed = create.safeParse(Object.fromEntries(data));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { name, engine, version, backups, project } = parsed.data;
  if (!(ENGINES[engine as Engine].versions as readonly string[]).includes(version)) return { error: "Unsupported version" };

  const [taken] = await db().select({ id: s.databases.id }).from(s.databases).where(eq(s.databases.name, name));
  if (taken) return { error: `${name} already exists` };

  const row = await insertDatabase({ name, engine, version, backupsEnabled: !!backups });
  if (project) {
    const [p] = await db().select().from(s.projects).where(eq(s.projects.slug, project));
    const envKey = ENGINES[engine as Engine].envKey;
    const [clash] = p
      ? await db().select({ id: s.databaseLinks.id }).from(s.databaseLinks).where(and(eq(s.databaseLinks.projectId, p.id), eq(s.databaseLinks.envKey, envKey)))
      : [];
    if (p && !clash) await db().insert(s.databaseLinks).values({ projectId: p.id, databaseId: row.id, envKey });
  }
  await queues().ops.add("provision-db", { kind: "provision-db", databaseId: row.id });
  redirect(`/databases?db=${encodeURIComponent(name)}`);
}

export async function deleteDatabase(rawId: string, _prev: FormState, data: FormData): Promise<FormState> {
  const row = await load(rawId);
  if (data.get("confirm") !== row.name) return { error: `Type ${row.name} to confirm` };
  await db().delete(s.databases).where(eq(s.databases.id, row.id));
  await queues().ops.add("destroy-db", { kind: "destroy-db", containerName: row.containerName, volumeName: row.volumeName, keepVolume: data.get("keepVolume") === "on" });
  await audit("database.deleted", row.name);
  redirect("/databases");
}

export async function retryProvision(rawId: string) {
  const row = await load(rawId);
  await db().update(s.databases).set({ status: "provisioning" }).where(eq(s.databases.id, row.id));
  await queues().ops.add("provision-db", { kind: "provision-db", databaseId: row.id });
  refresh();
}

// Older databases were created without a loopback port; recreate the container with one (data kept).
export async function enableTunnel(rawId: string) {
  const row = await load(rawId);
  if (row.localPort) return;
  await db().update(s.databases).set({ localPort: await nextLocalPort() }).where(eq(s.databases.id, row.id));
  await queues().ops.add("provision-db", { kind: "provision-db", databaseId: row.id, recreate: true });
  await audit("database.tunnel", row.name);
  refresh();
}
