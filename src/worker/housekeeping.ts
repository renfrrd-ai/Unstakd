import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { logDir } from "@/lib/logs";
import { caddyEnabled, ensureCaddy, previewRouteId, setRoute } from "@/server/caddy";
import { previewHost } from "@/lib/domains";
import { env } from "@/lib/env";
import { applyOfflineRoute, applyRoute, upstreamFor } from "@/server/routing";
import { audit } from "@/server/audit";
import { docker, removeProjectImages } from "@/server/docker";
import { isSiteRef, pruneSites, siteRefKey } from "@/server/static-site";

const KEEP_IMAGES = Number(process.env.KEEP_IMAGES ?? 10);
const BUILD_LOG_DAYS = Number(process.env.BUILD_LOG_DAYS ?? 30);

// Keeps the newest KEEP_IMAGES images per project (always including the live one) and old build logs out.
export async function prune(log: (l: string) => void = () => {}) {
  const projects = await db().select().from(s.projects);
  let removedImages = 0;
  let removedSites = 0;
  for (const p of projects) {
    const deploys = await db()
      .select({ id: s.deployments.id, imageTag: s.deployments.imageTag, status: s.deployments.status })
      .from(s.deployments)
      .where(and(eq(s.deployments.projectId, p.id), isNotNull(s.deployments.imageTag)))
      .orderBy(desc(s.deployments.number));
    const keep = new Set(deploys.slice(0, KEEP_IMAGES).map((d) => d.imageTag));
    const live = deploys.find((d) => d.id === p.liveDeploymentId);
    if (live?.imageTag) keep.add(live.imageTag);
    // Live previews too, however old.
    for (const d of deploys) if (d.status === "live" && d.imageTag) keep.add(d.imageTag);

    // Static deploys: same rule for their directories in the sites volume (previews included).
    const sites = new Set([...keep].filter(isSiteRef).map(siteRefKey));
    const hasSites = deploys.some((d) => isSiteRef(d.imageTag));
    if (hasSites) removedSites += await pruneSites(p.slug, sites).catch(() => 0);

    removedImages += await removeProjectImages(p.slug, new Set([...keep].filter((t): t is string => !!t)));
  }

  let removedLogs = 0;
  const cutoff = Date.now() - BUILD_LOG_DAYS * 24 * 3600 * 1000;
  for (const file of await readdir(logDir()).catch(() => [] as string[])) {
    const full = path.join(logDir(), file);
    if ((await stat(full)).mtimeMs < cutoff) {
      await rm(full, { force: true });
      removedLogs++;
    }
  }
  await docker().pruneImages({ filters: { dangling: ["true"] } }).catch(() => {});
  log(`pruned ${removedImages} images, ${removedSites} static site versions and ${removedLogs} build logs`);
}

/**
 * A deploy or backup the worker was running when it stopped (crash, reboot, or Unstakd redeploying
 * itself) can't resume. Mark them failed so projects aren't stuck "Building" with a Cancel button
 * that nothing answers. Returns the half-started containers; remove them only after
 * reconcileRoutes has pointed the proxy back at each project's live deploy.
 * Must run before the workers start taking jobs.
 */
export async function recoverInterrupted(log: (l: string) => void = () => {}) {
  const stuck = await db()
    .select({ d: s.deployments, project: s.projects.name })
    .from(s.deployments)
    .innerJoin(s.projects, eq(s.projects.id, s.deployments.projectId))
    .where(inArray(s.deployments.status, ["building", "deploying"]));
  const orphans: string[] = [];
  for (const { d, project } of stuck) {
    const steps = d.steps.map((st) => (st.status === "running" ? { ...st, status: "failed" as const, note: "interrupted" } : st.status === "pending" ? { ...st, status: "skipped" as const } : st));
    await db()
      .update(s.deployments)
      .set({ status: "failed", finishedAt: new Date(), steps, error: "The worker restarted during this deploy. Redeploy to try again; the previous deploy kept serving." })
      .where(eq(s.deployments.id, d.id));
    if (d.containerName) orphans.push(d.containerName);
    await audit("deploy.failed", project, { number: d.number, step: "interrupted" });
  }
  const backups = await db()
    .update(s.backups)
    .set({ status: "failed", error: "The worker restarted during this backup." })
    .where(eq(s.backups.status, "running"))
    .returning({ id: s.backups.id });
  if (stuck.length || backups.length) log(`marked ${stuck.length} interrupted deploy${stuck.length === 1 ? "" : "s"} and ${backups.length} backup${backups.length === 1 ? "" : "s"} as failed`);
  return orphans;
}

// After a reboot, proxy reset or env change, re-apply every live project's route.
export async function reconcileRoutes(log: (l: string) => void = () => {}) {
  if (!caddyEnabled()) return;
  if (await ensureCaddy({ refresh: true })) log("loaded the base proxy config");
  const projects = await db().select().from(s.projects).where(and(isNotNull(s.projects.liveDeploymentId), eq(s.projects.state, "active")));
  let applied = 0;
  for (const p of projects) {
    const [live] = await db().select().from(s.deployments).where(eq(s.deployments.id, p.liveDeploymentId!));
    if (!live || !upstreamFor(p, live)) continue;
    if (live.containerName && !(await docker().getContainer(live.containerName).inspect().then(() => true, () => false))) continue;
    await applyRoute(p, live);
    applied++;
  }
  for (const p of await db().select().from(s.projects).where(and(isNotNull(s.projects.liveDeploymentId), eq(s.projects.state, "standby")))) {
    await applyOfflineRoute(p);
    applied++;
  }
  const previews = await db()
    .select({ d: s.deployments, slug: s.projects.slug, port: s.projects.port })
    .from(s.deployments)
    .innerJoin(s.projects, eq(s.projects.id, s.deployments.projectId))
    .where(and(isNotNull(s.deployments.previewPr), eq(s.deployments.status, "live")));
  for (const { d, slug, port } of previews) {
    const upstream = upstreamFor({ port }, d);
    if (!upstream || !d.previewPr) continue;
    if (d.containerName && !(await docker().getContainer(d.containerName).inspect().then(() => true, () => false))) continue;
    await setRoute(slug, [previewHost(slug, d.previewPr, env().APPS_DOMAIN)], upstream, null, previewRouteId(slug, d.previewPr));
    applied++;
  }
  log(`re-applied ${applied} route${applied === 1 ? "" : "s"}`);
}
