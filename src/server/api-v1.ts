import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, schema as s } from "@/db";
import type { Deployment } from "@/db/schema";
import { publicUrl } from "@/lib/domains";
import { slugSchema } from "@/lib/validation";
import { apiAuth, unauthorized } from "./api-auth";
import { summarize, type ProjectSummary } from "./queries";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// Wraps a /api/v1 handler: bearer-token auth, JSON errors, no stack traces leaked.
export function api<C>(handler: (request: Request, ctx: C) => Promise<unknown>) {
  return async (request: Request, ctx: C) => {
    if (!(await apiAuth(request))) return unauthorized();
    try {
      const body = await handler(request, ctx);
      return body instanceof Response ? body : Response.json(body);
    } catch (e) {
      if (e instanceof ApiError) return Response.json({ error: e.message }, { status: e.status });
      if (e instanceof z.ZodError) return Response.json({ error: e.issues[0].message }, { status: 400 });
      console.error("api/v1:", e);
      return Response.json({ error: "internal error" }, { status: 500 });
    }
  };
}

export async function projectBySlug(raw: string): Promise<ProjectSummary> {
  const slug = slugSchema.safeParse(raw);
  const [row] = slug.success ? await db().select().from(s.projects).where(eq(s.projects.slug, slug.data)) : [];
  if (!row) throw new ApiError(404, `no project "${raw}"`);
  return (await summarize([row]))[0];
}

export async function deploymentById(raw: string) {
  const id = z.string().uuid().safeParse(raw);
  const [row] = id.success ? await db().select().from(s.deployments).where(eq(s.deployments.id, id.data)) : [];
  if (!row) throw new ApiError(404, "no such deployment");
  return row;
}

export const recentDeployments = (projectId: string, limit = 10) =>
  db()
    .select()
    .from(s.deployments)
    .where(and(eq(s.deployments.projectId, projectId), isNull(s.deployments.previewPr)))
    .orderBy(desc(s.deployments.number))
    .limit(limit);

export const deploymentJson = (d: Deployment) => ({
  id: d.id,
  number: d.number,
  status: d.status,
  trigger: d.trigger,
  commit: d.commitSha?.slice(0, 7) ?? null,
  message: d.commitMessage,
  previewPr: d.previewPr,
  createdAt: d.createdAt,
  finishedAt: d.finishedAt,
  error: d.error,
});

export const projectJson = (p: ProjectSummary) => ({
  slug: p.slug,
  name: p.name,
  repo: p.repo,
  branch: p.branch,
  health: p.health,
  url: publicUrl(p.primaryHost),
  live: p.live ? deploymentJson(p.live) : null,
  latest: p.latest ? deploymentJson(p.latest) : null,
});
