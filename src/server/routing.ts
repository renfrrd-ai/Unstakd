import { and, eq, inArray } from "drizzle-orm";
import { db, schema as s } from "@/db";
import type { Deployment, Project } from "@/db/schema";
import { defaultHost } from "@/lib/domains";
import { env } from "@/lib/env";
import { setRoute, type Upstream } from "./caddy";
import { isSiteRef, siteRoot } from "./static-site";

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

// A static deploy serves its files; anything else proxies to its container. Null if neither exists.
export function upstreamFor(project: Pick<Project, "port">, d: Pick<Deployment, "containerName" | "imageTag">): Upstream | null {
  if (isSiteRef(d.imageTag) && !d.containerName) return { root: siteRoot(d.imageTag) };
  return d.containerName ? { dial: `${d.containerName}:${project.port}` } : null;
}

export const describeUpstream = (up: Upstream) => ("dial" in up ? up.dial : "root" in up ? `files in ${up.root}` : "offline page");

// Standby: the project's hosts answer 503 "on standby" instead of falling through to the 404.
export async function applyOfflineRoute(project: Pick<Project, "id" | "slug" | "name">) {
  const plan = await planRoute(project);
  await setRoute(project.slug, plan.serve, { offline: `${project.name} is on standby. Start it from the Unstakd dashboard.` }, plan.redirect);
}

export async function applyRoute(project: Pick<Project, "id" | "slug" | "port">, deployment: Pick<Deployment, "containerName" | "imageTag">) {
  const upstream = upstreamFor(project, deployment);
  if (!upstream) throw new Error("deployment has nothing to route to");
  const plan = await planRoute(project);
  await setRoute(project.slug, plan.serve, upstream, plan.redirect);
  return { ...plan, upstream };
}
