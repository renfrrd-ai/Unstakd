import "server-only";
import { cache } from "react";
import { and, desc, eq, gte, inArray, isNotNull, isNull } from "drizzle-orm";
import { db, schema as s } from "@/db";
import type { Deployment, Domain, Project } from "@/db/schema";
import { decrypt } from "@/lib/crypto";
import { projectHealth, type ProjectHealth } from "@/lib/status";
import { requireUser } from "./session";

export type ProjectSummary = Project & {
  latest: Deployment | undefined;
  live: Deployment | undefined;
  primaryHost: string;
  health: ProjectHealth;
};

function primaryHost(domains: Domain[], project: Project) {
  const own = domains.filter((d) => d.projectId === project.id);
  return (own.find((d) => d.isPrimary) ?? own[0])?.hostname ?? `${project.slug}`;
}

// No auth check: callers (pages via requireUser, /api/v1 via token) authorise first.
export async function summarize(projects: Project[]): Promise<ProjectSummary[]> {
  if (projects.length === 0) return [];
  const ids = projects.map((p) => p.id);
  const [latest, domains] = await Promise.all([
    db()
      .selectDistinctOn([s.deployments.projectId])
      .from(s.deployments)
      .where(and(inArray(s.deployments.projectId, ids), isNull(s.deployments.previewPr)))
      .orderBy(s.deployments.projectId, desc(s.deployments.number)),
    db().select().from(s.domains).where(inArray(s.domains.projectId, ids)),
  ]);
  const liveIds = projects.map((p) => p.liveDeploymentId).filter((x): x is string => !!x);
  const live = liveIds.length ? await db().select().from(s.deployments).where(inArray(s.deployments.id, liveIds)) : [];

  return projects.map((p) => {
    const l = latest.find((d) => d.projectId === p.id);
    return {
      ...p,
      latest: l,
      live: live.find((d) => d.id === p.liveDeploymentId),
      primaryHost: primaryHost(domains, p),
      health: projectHealth(p, l),
    };
  });
}

export async function listProjects(): Promise<ProjectSummary[]> {
  await requireUser();
  const projects = await db().select().from(s.projects).orderBy(s.projects.name);
  const order: Record<ProjectHealth, number> = { building: 0, attention: 1, live: 2, new: 3, standby: 4 };
  return (await summarize(projects)).sort((a, b) => order[a.health] - order[b.health]);
}

// Deduped per request: the project header and the tab page both ask for it.
export const getProject = cache(async (slug: string): Promise<ProjectSummary | null> => {
  await requireUser();
  const [project] = await db().select().from(s.projects).where(eq(s.projects.slug, slug));
  if (!project) return null;
  const [summary] = await summarize([project]);
  return summary;
});

export async function listDeployments(projectId: string, limit = 20) {
  await requireUser();
  return db()
    .select()
    .from(s.deployments)
    .where(and(eq(s.deployments.projectId, projectId), isNull(s.deployments.previewPr)))
    .orderBy(desc(s.deployments.number))
    .limit(limit);
}

export async function listPreviews(projectId: string, limit = 20) {
  await requireUser();
  return db()
    .select()
    .from(s.deployments)
    .where(and(eq(s.deployments.projectId, projectId), isNotNull(s.deployments.previewPr)))
    .orderBy(desc(s.deployments.number))
    .limit(limit);
}

export async function getDeployment(projectId: string, number: number) {
  await requireUser();
  const [row] = await db()
    .select()
    .from(s.deployments)
    .where(and(eq(s.deployments.projectId, projectId), eq(s.deployments.number, number)));
  return row ?? null;
}

export async function deployStats() {
  await requireUser();
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const rows = await db().select().from(s.deployments).where(gte(s.deployments.createdAt, since));
  const durations = rows
    .filter((d) => d.status === "live" || d.status === "superseded")
    .map((d) => (d.finishedAt && d.startedAt ? d.finishedAt.getTime() - d.startedAt.getTime() : null))
    .filter((x): x is number => x != null)
    .sort((a, b) => a - b);
  const median = durations.length ? durations[Math.floor(durations.length / 2)] : null;
  return { count: rows.length, medianMs: median };
}

export async function listDomains(projectId?: string) {
  await requireUser();
  const q = db()
    .select({ domain: s.domains, project: { slug: s.projects.slug, name: s.projects.name } })
    .from(s.domains)
    .innerJoin(s.projects, eq(s.projects.id, s.domains.projectId))
    .orderBy(desc(s.domains.isPrimary), s.domains.hostname);
  return projectId ? q.where(eq(s.domains.projectId, projectId)) : q;
}

export type EnvVarView = { id: string; key: string; secret: boolean; value: string | null };

// Secret values never leave the server; the UI shows a mask and can only replace them.
export async function listEnvVars(projectId: string): Promise<EnvVarView[]> {
  await requireUser();
  const rows = await db().select().from(s.envVars).where(eq(s.envVars.projectId, projectId)).orderBy(s.envVars.key);
  return rows.map((r) => ({ id: r.id, key: r.key, secret: r.secret, value: r.secret ? null : decrypt(r.valueEnc) }));
}

export async function listDatabases() {
  await requireUser();
  const [dbs, links, backups] = await Promise.all([
    db().select().from(s.databases).orderBy(s.databases.name),
    db()
      .select({ link: s.databaseLinks, project: { slug: s.projects.slug, name: s.projects.name } })
      .from(s.databaseLinks)
      .innerJoin(s.projects, eq(s.projects.id, s.databaseLinks.projectId)),
    db().selectDistinctOn([s.backups.databaseId]).from(s.backups).orderBy(s.backups.databaseId, desc(s.backups.createdAt)),
  ]);
  return dbs.map((d) => ({
    ...d,
    links: links.filter((l) => l.link.databaseId === d.id),
    lastBackup: backups.find((b) => b.databaseId === d.id),
  }));
}

export async function linkedDatabases(projectId: string) {
  await requireUser();
  return db()
    .select({ name: s.databases.name, engine: s.databases.engine, envKey: s.databaseLinks.envKey })
    .from(s.databaseLinks)
    .innerJoin(s.databases, eq(s.databases.id, s.databaseLinks.databaseId))
    .where(eq(s.databaseLinks.projectId, projectId));
}

export async function recentActivity(limit = 10) {
  await requireUser();
  return db().select().from(s.auditEvents).orderBy(desc(s.auditEvents.createdAt)).limit(limit);
}

export async function listBackups(databaseId: string, limit = 7) {
  await requireUser();
  return db().select().from(s.backups).where(eq(s.backups.databaseId, databaseId)).orderBy(desc(s.backups.createdAt)).limit(limit);
}

export async function appMetrics(projectId: string, sinceMs = 24 * 3600_000) {
  await requireUser();
  const now = Date.now();
  const rows = await db()
    .select()
    .from(s.appMetrics)
    .where(and(eq(s.appMetrics.projectId, projectId), gte(s.appMetrics.at, new Date(now - sinceMs))))
    .orderBy(s.appMetrics.at);
  // The counter belongs to a container and resets on redeploy, so count increases only.
  let restarts = 0;
  for (let i = 1; i < rows.length; i++) restarts += Math.max(0, rows[i].restarts - rows[i - 1].restarts);
  return { rows, restarts, now };
}
