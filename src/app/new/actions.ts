"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema as s } from "@/db";
import { encrypt } from "@/lib/crypto";
import { defaultHost } from "@/lib/domains";
import { env } from "@/lib/env";
import { queues } from "@/lib/queue";
import { buildCommandSchema, outputDirSchema, rootDirSchema, parseDotEnv, REPO, SIZES, newSlugSchema, type FormState, type Size } from "@/lib/validation";
import { audit } from "@/server/audit";
import { dbContainerName, dbVolumeName, ENGINES, newCredentials, nextLocalPort } from "@/server/database-catalog";
import { createDeployment } from "@/server/deployments";
import { requireUser } from "@/server/session";

const schema = z.object({
  repo: z.string().regex(REPO, "Invalid repository"),
  branch: z.string().trim().min(1).regex(/^[A-Za-z0-9._/-]+$/, "Invalid branch name"),
  slug: newSlugSchema,
  port: z.coerce.number().int().min(1).max(65535),
  healthPath: z.string().trim().regex(/^\/\S*$/, "Health path must start with /"),
  size: z.enum(Object.keys(SIZES) as [Size, ...Size[]]),
  buildMode: z.enum(["railpack", "dockerfile", "static"]),
  buildCommand: buildCommandSchema.optional(),
  outputDir: outputDirSchema.optional(),
  rootDir: rootDirSchema.optional(),
  framework: z.string().optional(),
  dotenv: z.string().optional(),
  createDb: z.literal("on").optional(),
});

export async function createProject(_prev: FormState, data: FormData): Promise<FormState> {
  await requireUser();
  const parsed = schema.safeParse(Object.fromEntries(data));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const p = parsed.data;

  const { entries, invalid } = parseDotEnv(p.dotenv ?? "");
  if (invalid.length) return { error: `Couldn't read .env line${invalid.length > 1 ? "s" : ""} ${invalid.join(", ")}` };

  const [taken] = await db().select({ id: s.projects.id }).from(s.projects).where(eq(s.projects.slug, p.slug));
  if (taken) return { error: `${p.slug} is already used by another project` };
  const host = defaultHost(p.slug, env().APPS_DOMAIN);
  const dbName = `${p.slug}-pg`;
  if (p.createDb) {
    const [dbTaken] = await db().select({ id: s.databases.id }).from(s.databases).where(eq(s.databases.name, dbName));
    if (dbTaken) return { error: `A database named ${dbName} already exists; link it after creating the project` };
  }

  const { project, databaseId } = await db().transaction(async (tx) => {
    const [project] = await tx
      .insert(s.projects)
      .values({
        name: p.slug,
        slug: p.slug,
        repo: p.repo,
        branch: p.branch,
        buildMode: p.buildMode,
        framework: p.framework || null,
        buildCommand: p.buildMode === "static" ? (p.buildCommand ?? null) : null,
        outputDir: p.buildMode === "static" ? (p.outputDir ?? null) : null,
        rootDir: p.rootDir ?? null,
        port: p.port,
        healthPath: p.healthPath,
        cpuLimit: SIZES[p.size].cpu,
        memoryMb: SIZES[p.size].memoryMb,
      })
      .returning();
    await tx.insert(s.domains).values({ projectId: project.id, hostname: host, status: "active", isPrimary: true, verifiedAt: new Date() });
    if (entries.length) {
      await tx.insert(s.envVars).values(entries.map(([key, value]) => ({ projectId: project.id, key, valueEnc: encrypt(value), secret: true })));
    }
    let databaseId: string | null = null;
    if (p.createDb) {
      const [database] = await tx
        .insert(s.databases)
        .values({
          name: dbName,
          engine: "postgres",
          version: ENGINES.postgres.versions[0],
          status: "provisioning",
          localPort: await nextLocalPort(),
          containerName: dbContainerName(dbName),
          volumeName: dbVolumeName(dbName),
          credentialsEnc: encrypt(JSON.stringify(newCredentials("postgres", dbName))),
        })
        .returning();
      await tx.insert(s.databaseLinks).values({ projectId: project.id, databaseId: database.id, envKey: "DATABASE_URL" });
      databaseId = database.id;
    }
    return { project, databaseId };
  });

  // Provision the database first so it's usually ready before the build finishes.
  if (databaseId) await queues().ops.add("provision-db", { kind: "provision-db", databaseId });
  await audit("project.created", project.name, { repo: project.repo });
  const deployment = await createDeployment(project, { trigger: "create" });
  redirect(`/projects/${project.slug}/deployments/${deployment.number}`);
}
