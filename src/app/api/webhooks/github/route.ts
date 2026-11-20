import { and, eq, inArray, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { db, schema as s } from "@/db";
import { createDeployment } from "@/server/deployments";
import { verifySignature } from "@/server/github-webhook";
import { queues } from "@/lib/queue";
import { redis } from "@/lib/redis";

const push = z.object({
  ref: z.string(),
  deleted: z.boolean().optional(),
  repository: z.object({ full_name: z.string() }),
  head_commit: z.object({ id: z.string(), message: z.string() }).nullable(),
});

// A repo webhook and the GitHub App can both deliver the same push at nearly the same moment;
// the first to claim the (project, commit) pair builds it.
async function claim(key: string) {
  return (await redis().set(`webhook:${key}`, "1", "EX", 600, "NX")) === "OK";
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  if (!verifySignature(process.env.GITHUB_WEBHOOK_SECRET ?? "", body, request.headers.get("x-hub-signature-256"))) {
    return Response.json({ error: "invalid signature" }, { status: 401 });
  }
  const event = request.headers.get("x-github-event");
  if (event === "ping") return Response.json({ ok: true });
  if (event === "pull_request") return handlePullRequest(JSON.parse(body));
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
    if (!(await claim(`${project.id}:${head_commit.id}`))) continue;
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

const pullRequest = z.object({
  action: z.string(),
  number: z.number().int().positive(),
  repository: z.object({ full_name: z.string() }),
  pull_request: z.object({
    title: z.string(),
    head: z.object({ sha: z.string() }),
    base: z.object({ ref: z.string() }),
  }),
});

async function handlePullRequest(payload: unknown) {
  const parsed = pullRequest.safeParse(payload);
  if (!parsed.success) return Response.json({ error: "unexpected payload" }, { status: 400 });
  const { action, number, repository, pull_request: pr } = parsed.data;

  const projects = await db()
    .select()
    .from(s.projects)
    .where(
      and(
        sql`lower(${s.projects.repo}) = lower(${repository.full_name})`,
        eq(s.projects.branch, pr.base.ref),
        eq(s.projects.previewsEnabled, true),
        eq(s.projects.state, "active"),
      ),
    );

  if (action === "closed") {
    for (const p of projects) await queues().ops.add("teardown-preview", { kind: "teardown-preview", projectId: p.id, pr: number });
    return Response.json({ removed: projects.map((p) => `${p.slug} PR #${number}`) }, { status: 202 });
  }
  if (!["opened", "synchronize", "reopened"].includes(action)) return Response.json({ ignored: action }, { status: 202 });

  const queued: string[] = [];
  for (const project of projects) {
    if (!(await claim(`${project.id}:pr${number}:${pr.head.sha}`))) continue;
    const [dupe] = await db()
      .select({ id: s.deployments.id })
      .from(s.deployments)
      .where(and(eq(s.deployments.projectId, project.id), eq(s.deployments.previewPr, number), eq(s.deployments.commitSha, pr.head.sha), inArray(s.deployments.status, ["queued", "building", "deploying", "live"])));
    if (dupe) continue;
    const d = await createDeployment(project, { trigger: "preview", previewPr: number, commitSha: pr.head.sha, commitMessage: pr.title });
    queued.push(`${project.slug}#${d.number} (PR #${number})`);
  }
  return Response.json({ queued }, { status: 202 });
}
