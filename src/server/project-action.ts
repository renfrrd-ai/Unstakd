import "server-only";
import { refresh } from "next/cache";
import { slugSchema } from "@/lib/validation";
import { getProject } from "./queries";

export async function projectFor(rawSlug: string) {
  const slug = slugSchema.safeParse(rawSlug);
  const project = slug.success ? await getProject(slug.data) : null;
  if (!project) throw new Error("Project not found");
  return project;
}

export function done(ok: string) {
  refresh();
  return { ok };
}
