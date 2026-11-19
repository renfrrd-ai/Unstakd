import { and, eq, inArray } from "drizzle-orm";
import { db, schema as s } from "@/db";
import type { Project } from "@/db/schema";
import { defaultHost } from "@/lib/domains";
import { env } from "@/lib/env";
import { setRoute } from "./caddy";

export type RoutePlan = { serve: string[]; redirect: { from: string[]; to: string } | null };

// The www/apex twin of the primary host redirects to it; every other host serves the app.
export function splitHosts(primary: string, hosts: string[]): RoutePlan {
  const twin = primary.startsWith("www.") ? primary.slice(4) : `www.${primary}`;
  const unique = [...new Set([primary, ...hosts])];
  const from = unique.filter((h) => h === twin);
  return { serve: unique.filter((h) => h !== twin), redirect: from.length ? { from, to: primary } : null };
}

export async function planRoute(project: Pick<Project, "id" | "slug">): Promise<RoutePlan> {
  const fallback = defaultHost(project.slug, env().APPS_DOMAIN);
  const custom = await db()
    .select({ hostname: s.domains.hostname, isPrimary: s.domains.isPrimary })
    .from(s.domains)
    .where(and(eq(s.domains.projectId, project.id), inArray(s.domains.status, ["verified", "active"])));
  const primary = custom.find((d) => d.isPrimary)?.hostname ?? fallback;
  return splitHosts(primary, [fallback, ...custom.map((d) => d.hostname)]);
}

export async function applyRoute(project: Pick<Project, "id" | "slug" | "port">, containerName: string) {
  const plan = await planRoute(project);
  await setRoute(project.slug, plan.serve, `${containerName}:${project.port}`, plan.redirect);
  return plan;
}
