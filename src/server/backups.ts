import { and, eq, lt } from "drizzle-orm";
import type { Readable } from "node:stream";
import { db, schema as s } from "@/db";
import type { Backup, Database } from "@/db/schema";
import { decrypt } from "@/lib/crypto";
import { backupStore } from "./backup-store";
import { imageFor } from "./database-catalog";
import type { DbCredentials } from "./db-connection";
import { docker, execIn, execStream, LABEL, startContainer, stopContainer, waitFor } from "./docker";

const RETENTION_DAYS = Number(process.env.BACKUP_RETENTION_DAYS ?? 7);

const creds = (d: Database) => JSON.parse(decrypt(d.credentialsEnc)) as DbCredentials;

function objectKey(d: Database) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${d.name}/${stamp}.${d.engine === "postgres" ? "dump" : "tar"}`;
}

async function dumpStream(d: Database): Promise<{ body: Readable; done: Promise<{ exitCode: number; stderr: string }> }> {
  const c = creds(d);
  if (d.engine === "postgres") {
    const { stdout, done } = await execStream(d.containerName, ["pg_dump", "-Fc", "-U", c.user ?? "app", "-d", c.database ?? "app"], { env: [`PGPASSWORD=${c.password}`] });
    return { body: stdout, done };
  }
  // Redis: flush a snapshot to disk, then archive the whole data dir (RDB + AOF).
  const save = await execIn(d.containerName, ["redis-cli", "save"], [`REDISCLI_AUTH=${c.password}`]);
  if (!save.output.includes("OK")) throw new Error(`redis save failed: ${save.output.trim()}`);
  const archive = (await docker().getContainer(d.containerName).getArchive({ path: "/data" })) as unknown as Readable;
  return { body: archive, done: new Promise((resolve) => archive.on("end", () => resolve({ exitCode: 0, stderr: "" }))) };
}

export async function backupDatabase(d: Database): Promise<Backup> {
  const store = backupStore();
  const key = objectKey(d);
  const [row] = await db().insert(s.backups).values({ databaseId: d.id, objectKey: key, storage: store.kind, status: "running" }).returning();
  try {
    const { body, done } = await dumpStream(d);
    const [size, result] = await Promise.all([store.put(key, body), done]);
    if (result.exitCode !== 0) throw new Error(result.stderr.trim() || `dump exited with ${result.exitCode}`);
    const [updated] = await db().update(s.backups).set({ status: "done", sizeBytes: size }).where(eq(s.backups.id, row.id)).returning();
    return updated;
  } catch (e) {
    await store.delete(key).catch(() => {});
    await db().update(s.backups).set({ status: "failed", error: (e as Error).message.slice(0, 500) }).where(eq(s.backups.id, row.id));
    throw e;
  }
}

export async function restoreDatabase(d: Database, backup: Backup) {
  if (!backup.objectKey || backup.status !== "done") throw new Error("backup is not restorable");
  const body = await backupStore().get(backup.objectKey);
  const c = creds(d);

  if (d.engine === "postgres") {
    const { stdout, done } = await execStream(
      d.containerName,
      ["pg_restore", "--clean", "--if-exists", "--no-owner", "--single-transaction", "-U", c.user ?? "app", "-d", c.database ?? "app"],
      { env: [`PGPASSWORD=${c.password}`], stdin: body },
    );
    stdout.resume();
    const result = await done;
    if (result.exitCode !== 0) throw new Error(result.stderr.trim() || `pg_restore exited with ${result.exitCode}`);
    return;
  }

  // Redis: stop it, replace the data dir through a helper container on the same volume, start again.
  await stopContainer(d.containerName);
  const helper = await docker().createContainer({
    Image: imageFor(d),
    Cmd: ["sleep", "300"],
    Labels: { [`${LABEL}.managed`]: "true", [`${LABEL}.kind`]: "helper" },
    HostConfig: { Mounts: [{ Type: "volume", Source: d.volumeName, Target: "/data" }] },
  });
  try {
    await helper.start();
    const clear = await execIn(helper.id, ["find", "/data", "-mindepth", "1", "-delete"]);
    if (clear.exitCode !== 0) throw new Error(`could not clear data dir: ${clear.output}`);
    await helper.putArchive(body as unknown as NodeJS.ReadableStream, { path: "/" });
  } finally {
    await helper.remove({ force: true });
  }
  await startContainer(d.containerName);
  const ok = await waitFor(async () => (await execIn(d.containerName, ["redis-cli", "ping"], [`REDISCLI_AUTH=${c.password}`])).output.includes("PONG"), { timeoutMs: 30_000 });
  if (!ok) throw new Error("redis did not come back after restore");
}

export async function pruneBackups(databaseId?: string) {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 3600 * 1000);
  const where = databaseId ? and(lt(s.backups.createdAt, cutoff), eq(s.backups.databaseId, databaseId)) : lt(s.backups.createdAt, cutoff);
  const old = await db().select().from(s.backups).where(where);
  const store = backupStore();
  for (const b of old) {
    if (b.objectKey && b.storage === store.kind) await store.delete(b.objectKey).catch(() => {});
    await db().delete(s.backups).where(eq(s.backups.id, b.id));
  }
  return old.length;
}

// The platform's own Postgres (projects, deployments, encrypted secrets). Runs in the compose stack,
// found by container name; its dumps go to the same store under platform/.
export async function backupPlatform(): Promise<{ key: string; size: number } | null> {
  const container = process.env.PLATFORM_DB_CONTAINER;
  if (!container) return null;
  const url = new URL(process.env.DATABASE_URL ?? "");
  const store = backupStore();
  const key = `platform/${new Date().toISOString().replace(/[:.]/g, "-")}.dump`;
  const { stdout, done } = await execStream(container, ["pg_dump", "-Fc", "-U", decodeURIComponent(url.username), "-d", url.pathname.slice(1)], {
    env: [`PGPASSWORD=${decodeURIComponent(url.password)}`],
  });
  const [size, result] = await Promise.all([store.put(key, stdout), done]);
  if (result.exitCode !== 0) {
    await store.delete(key).catch(() => {});
    throw new Error(result.stderr.trim() || `platform pg_dump exited with ${result.exitCode}`);
  }
  return { key, size };
}
