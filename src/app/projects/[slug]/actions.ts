"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { cancelDeployment, createDeployment } from "@/server/deployments";
import { getDeployment, getProject } from "@/server/queries";
import { requireUser } from "@/server/session";

const slug = z.string().regex(/^[a-z0-9-]+$/);
const num = z.coerce.number().int().positive();

async function load(rawSlug: string) {
  await requireUser();
  const project = await getProject(slug.parse(rawSlug));
  if (!project) throw new Error("Project not found");
  return project;
}

export async function redeploy(rawSlug: string) {
  const project = await load(rawSlug);
  const d = await createDeployment(project, { trigger: "manual", commitSha: null, commitMessage: "manual redeploy" });
  redirect(`/projects/${project.slug}/deployments/${d.number}`);
}

export async function rollback(rawSlug: string, rawNumber: number) {
  const project = await load(rawSlug);
  const target = await getDeployment(project.id, num.parse(rawNumber));
  if (!target?.imageTag || target.previewPr || !["live", "superseded"].includes(target.status)) throw new Error("That deploy has no image to roll back to");
  const d = await createDeployment(project, { trigger: "rollback", rollbackOf: target });
  redirect(`/projects/${project.slug}/deployments/${d.number}`);
}

export async function cancel(rawSlug: string, rawNumber: number) {
  const project = await load(rawSlug);
  const d = await getDeployment(project.id, num.parse(rawNumber));
  if (d && ["queued", "building", "deploying"].includes(d.status)) await cancelDeployment(d);
  refresh();
}
