import { eq, ne } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { env } from "@/lib/env";
import { audit } from "@/server/audit";
import { setRoute } from "@/server/caddy";
import { checkDns } from "@/server/domain-check";
import { routeHosts } from "./deploy";

async function httpsWorks(hostname: string) {
  try {
    await fetch(`https://${hostname}/`, { redirect: "manual", signal: AbortSignal.timeout(8000) });
    return true;
  } catch {
    return false;
  }
}

async function syncProjectRoute(projectId: string) {
  const [project] = await db().select().from(s.projects).where(eq(s.projects.id, projectId));
  if (!project?.liveDeploymentId || project.state !== "active") return;
  const [live] = await db().select().from(s.deployments).where(eq(s.deployments.id, project.liveDeploymentId));
  if (live?.containerName) await setRoute(project.slug, await routeHosts(project), `${live.containerName}:${project.port}`);
}

// Runs every minute: moves custom domains through pending → verified → active, or to misconfigured.
export async function checkDomains(log: (l: string) => void = () => {}) {
  const { EDGE_HOST, EDGE_IP, APPS_DOMAIN } = env();
  const https = process.env.CADDY_HTTPS === "true";
  const rows = await db().select().from(s.domains).where(ne(s.domains.hostname, ""));
  const touched = new Set<string>();

  for (const d of rows) {
    if (d.hostname === APPS_DOMAIN || d.hostname.endsWith(`.${APPS_DOMAIN}`)) continue;
    const verdict = await checkDns(d.hostname, { host: EDGE_HOST, ip: EDGE_IP });
    let status = d.status;
    if (verdict === "ok") {
      if (status === "pending" || status === "misconfigured") status = "verified";
      if (status === "verified" && (!https || (await httpsWorks(d.hostname)))) status = "active";
    } else if (status === "verified" || status === "active") {
      status = "misconfigured";
    }
    await db()
      .update(s.domains)
      .set({ status, lastCheckedAt: new Date(), verifiedAt: status === "verified" && d.status !== "verified" ? new Date() : d.verifiedAt })
      .where(eq(s.domains.id, d.id));
    if (status !== d.status) {
      log(`${d.hostname}: ${d.status} → ${status} (${verdict})`);
      touched.add(d.projectId);
      if (status === "active" && https) await audit("domain.certificate", d.hostname, { issuer: "Let's Encrypt" });
      if (status === "misconfigured") await audit("domain.misconfigured", d.hostname, { dns: verdict });
    }
  }
  for (const projectId of touched) await syncProjectRoute(projectId).catch((e) => log(`route sync failed: ${(e as Error).message}`));
}
