import { randomBytes } from "node:crypto";
import { max } from "drizzle-orm";
import { db, schema as s } from "@/db";
import type { Database } from "@/db/schema";
import { encrypt } from "@/lib/crypto";
import type { DbCredentials } from "./db-connection";

export const ENGINES = {
  postgres: { label: "PostgreSQL", versions: ["18", "17", "16"], envKey: "DATABASE_URL", memoryMb: 512, usageLabel: "Storage" },
  redis: { label: "Redis", versions: ["8", "7"], envKey: "REDIS_URL", memoryMb: 256, usageLabel: "Memory" },
} as const;
export type Engine = keyof typeof ENGINES;

export const dbContainerName = (name: string) => `db-${name}`;
export const dbVolumeName = (name: string) => `unstakd-db-${name}`;

export function newCredentials(engine: Engine, name: string): DbCredentials {
  const password = randomBytes(24).toString("base64url");
  return engine === "postgres" ? { user: "app", password, database: name.replace(/-/g, "_") } : { password };
}

export function imageFor(d: Pick<Database, "engine" | "version">) {
  return `${d.engine}:${d.version}-alpine`;
}

export const LOCAL_PORT_BASE = Number(process.env.DB_LOCAL_PORT_BASE ?? 15432);

export async function nextLocalPort() {
  const [row] = await db().select({ max: max(s.databases.localPort) }).from(s.databases);
  return Math.max(LOCAL_PORT_BASE, (row?.max ?? LOCAL_PORT_BASE - 1) + 1);
}

export async function insertDatabase(input: { name: string; engine: Engine; version: string; backupsEnabled: boolean }) {
  const [row] = await db()
    .insert(s.databases)
    .values({
      ...input,
      status: "provisioning",
      localPort: await nextLocalPort(),
      containerName: dbContainerName(input.name),
      volumeName: dbVolumeName(input.name),
      credentialsEnc: encrypt(JSON.stringify(newCredentials(input.engine, input.name))),
    })
    .returning();
  return row;
}

// What the usage meter is measured against: a soft disk quota for Postgres, the memory limit for Redis.
export function usageCapacityBytes(engine: Engine) {
  if (engine === "redis") return ENGINES.redis.memoryMb * 1024 * 1024;
  return Number(process.env.DB_STORAGE_QUOTA_GB ?? 10) * 1024 ** 3;
}
