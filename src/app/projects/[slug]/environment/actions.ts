"use server";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema as s } from "@/db";
import { encrypt } from "@/lib/crypto";
import { envKeySchema, parseDotEnv, type FormState } from "@/lib/validation";
import { audit } from "@/server/audit";
import { done, projectFor } from "@/server/project-action";

async function upsert(projectId: string, entries: [string, string][], secret: boolean) {
  if (entries.length === 0) return;
  await db()
    .insert(s.envVars)
    .values(entries.map(([key, value]) => ({ projectId, key, valueEnc: encrypt(value), secret })))
    .onConflictDoUpdate({
      target: [s.envVars.projectId, s.envVars.key],
      set: { valueEnc: sql`excluded.value_enc`, secret: sql`excluded.secret`, updatedAt: new Date() },
    });
}

const one = z.object({ key: envKeySchema, value: z.string().max(32_768), secret: z.literal("on").optional() });

export async function setEnvVar(slug: string, _prev: FormState, data: FormData): Promise<FormState> {
  const project = await projectFor(slug);
  const parsed = one.safeParse({ key: data.get("key"), value: data.get("value") ?? "", secret: data.get("secret") ?? undefined });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await upsert(project.id, [[parsed.data.key, parsed.data.value]], !!parsed.data.secret);
  await audit("env.updated", project.name, { keys: parsed.data.key });
  return done(`Saved ${parsed.data.key}. Redeploy to apply.`);
}

export async function importDotEnv(slug: string, _prev: FormState, data: FormData): Promise<FormState> {
  const project = await projectFor(slug);
  const { entries, invalid } = parseDotEnv(String(data.get("dotenv") ?? ""));
  if (invalid.length) return { error: `Couldn't read line${invalid.length > 1 ? "s" : ""} ${invalid.join(", ")}` };
  if (entries.length === 0) return { error: "Nothing to import" };
  await upsert(project.id, entries, true);
  await audit("env.updated", project.name, { keys: entries.map(([k]) => k).join(", ") });
  return done(`Imported ${entries.length} variable${entries.length > 1 ? "s" : ""} as secrets. Redeploy to apply.`);
}

export async function deleteEnvVar(slug: string, key: string) {
  const project = await projectFor(slug);
  await db().delete(s.envVars).where(and(eq(s.envVars.projectId, project.id), eq(s.envVars.key, envKeySchema.parse(key))));
  await audit("env.updated", project.name, { keys: `removed ${key}` });
  done("removed");
}
