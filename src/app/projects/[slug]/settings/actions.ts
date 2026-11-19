"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema as s } from "@/db";
import { queues } from "@/lib/queue";
import { SIZES, type FormState, type Size } from "@/lib/validation";
import { audit } from "@/server/audit";
import { done, projectFor } from "@/server/project-action";

const settings = z.object({
  branch: z.string().trim().min(1).max(200).regex(/^[A-Za-z0-9._/-]+$/, "Invalid branch name"),
  buildMode: z.enum(["railpack", "dockerfile", "static"]),
  port: z.coerce.number().int().min(1).max(65535),
  healthPath: z.string().trim().regex(/^\/[^\s]*$/, "Health path must start with /"),
  size: z.enum(Object.keys(SIZES) as [Size, ...Size[]]),
});

export async function updateSettings(slug: string, _prev: FormState, data: FormData): Promise<FormState> {
  const project = await projectFor(slug);
  const parsed = settings.safeParse(Object.fromEntries(data));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { size, ...rest } = parsed.data;
  await db().update(s.projects).set({ ...rest, cpuLimit: SIZES[size].cpu, memoryMb: SIZES[size].memoryMb }).where(eq(s.projects.id, project.id));
  await audit("project.settings", project.name, { fields: Object.keys(parsed.data).join(", ") });
  return done("Saved. Changes apply on the next deploy.");
}

export async function setStandby(slug: string, standby: boolean) {
  const project = await projectFor(slug);
  await db().update(s.projects).set({ state: standby ? "standby" : "active" }).where(eq(s.projects.id, project.id));
  await queues().ops.add(standby ? "standby" : "start", { kind: standby ? "standby" : "start", projectId: project.id });
  await audit(standby ? "project.standby" : "project.started", project.name);
  done("ok");
}

export async function deleteProject(slug: string, _prev: FormState, data: FormData): Promise<FormState> {
  const project = await projectFor(slug);
  if (data.get("confirm") !== project.name) return { error: `Type ${project.name} to confirm` };
  const hostnames = (await db().select({ h: s.domains.hostname }).from(s.domains).where(eq(s.domains.projectId, project.id))).map((r) => r.h);
  await db().delete(s.projects).where(eq(s.projects.id, project.id));
  await queues().ops.add("teardown", { kind: "teardown", slug: project.slug, hostnames });
  await audit("project.deleted", project.name);
  redirect("/");
}

export async function setPreviews(slug: string, enabled: boolean) {
  const project = await projectFor(slug);
  await db().update(s.projects).set({ previewsEnabled: enabled }).where(eq(s.projects.id, project.id));
  await audit("project.settings", project.name, { fields: enabled ? "preview deploys on" : "preview deploys off" });
  done("ok");
}
