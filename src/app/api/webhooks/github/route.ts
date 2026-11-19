import { and, eq, inArray, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { db, schema as s } from "@/db";
import { createDeployment } from "@/server/deployments";
import { verifySignature } from "@/server/github-webhook";

const push = z.object({
  ref: z.string(),
  deleted: z.boolean().optional(),
  repository: z.object({ full_name: z.string() }),
  head_commit: z.object({ id: z.string(), message: z.string() }).nullable(),
});

export async function POST(request: NextRequest) {
  const body = await request.text();
  if (!verifySignature(process.env.GITHUB_WEBHOOK_SECRET ?? "", body, request.headers.get("x-hub-signature-256"))) {
    return Response.json({ error: "invalid signature" }, { status: 401 });
  }
  const event = request.headers.get("x-github-event");
  if (event === "ping") return Response.json({ ok: true });
  if (event !== "push") return Response.json({ ignored: event }, { status: 202 });

  const parsed = push.safeParse(JSON.parse(body));
  if (!parsed.success) return Response.json({ error: "unexpected payload" }, { status: 400 });
  const { ref, deleted, repository, head_commit } = parsed.data;
  if (deleted || !head_commit || !ref.startsWith("refs/heads/")) return Response.json({ ignored: "not a branch push" }, { status: 202 });
  const branch = ref.slice("refs/heads/".length);

  const projects = await db()
    .select()
    .from(s.projects)
    .where(and(sql`lower(${s.projects.repo}) = lower(${repository.full_name})`, eq(s.projects.branch, branch), eq(s.projects.state, "active")));

  const queued: string[] = [];
  for (const project of projects) {
    // GitHub retries deliveries; don't build the same commit twice.
    const [dupe] = await db()
      .select({ id: s.deployments.id })
      .from(s.deployments)
      .where(and(eq(s.deployments.projectId, project.id), eq(s.deployments.commitSha, head_commit.id), inArray(s.deployments.status, ["queued", "building", "deploying", "live"])));
    if (dupe) continue;
    const d = await createDeployment(project, { trigger: "push", commitSha: head_commit.id, commitMessage: head_commit.message.split("\n")[0] });
    queued.push(`${project.slug}#${d.number}`);
  }
  return Response.json({ queued }, { status: 202 });
}
