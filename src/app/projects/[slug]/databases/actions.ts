"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema as s } from "@/db";
import { envKeySchema, type FormState } from "@/lib/validation";
import { audit } from "@/server/audit";
import { done, projectFor } from "@/server/project-action";

const link = z.object({ databaseId: z.string().uuid(), envKey: envKeySchema });

export async function linkDatabase(slug: string, _prev: FormState, data: FormData): Promise<FormState> {
  const project = await projectFor(slug);
  const parsed = link.safeParse({ databaseId: data.get("databaseId"), envKey: data.get("envKey") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const [database] = await db().select().from(s.databases).where(eq(s.databases.id, parsed.data.databaseId));
  if (!database) return { error: "Database not found" };

  const clash = await db()
    .select({ id: s.databaseLinks.id })
    .from(s.databaseLinks)
    .where(and(eq(s.databaseLinks.projectId, project.id), eq(s.databaseLinks.envKey, parsed.data.envKey)));
  if (clash.length) return { error: `${parsed.data.envKey} is already provided by another database` };

  await db().insert(s.databaseLinks).values({ projectId: project.id, ...parsed.data }).onConflictDoNothing();
  await audit("database.linked", `${database.name} → ${project.name}`, { envKey: parsed.data.envKey });
  return done(`Linked ${database.name} as ${parsed.data.envKey}. Redeploy to apply.`);
}

export async function unlinkDatabase(slug: string, linkId: string) {
  const project = await projectFor(slug);
  await db().delete(s.databaseLinks).where(and(eq(s.databaseLinks.id, z.string().uuid().parse(linkId)), eq(s.databaseLinks.projectId, project.id)));
  await audit("database.unlinked", project.name);
  done("unlinked");
}
