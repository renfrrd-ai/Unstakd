import type { AuditEvent } from "@/db/schema";

// Human sentence + mono detail for an audit event, as shown in Activity lists.
export function describeEvent(e: Pick<AuditEvent, "action" | "target" | "details">): { text: string; detail: string } {
  const d = (e.details ?? {}) as Record<string, string | number | undefined>;
  switch (e.action) {
    case "backup.completed":
      return { text: `Backups finished for ${e.target}`, detail: `sent to ${d.destination ?? "R2"}` };
    case "backup.failed":
      return { text: `Backup failed for ${e.target}`, detail: String(d.error ?? "") };
    case "backup.restored":
      return { text: `${e.target} restored from a backup`, detail: d.from ? new Date(String(d.from)).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" }) : "" };
    case "database.deleted":
      return { text: `Database ${e.target} deleted`, detail: "" };
    case "database.failed":
      return { text: `Database ${e.target} failed to start`, detail: String(d.engine ?? "") };
    case "database.tunnel":
      return { text: `Tunnel access enabled for ${e.target}`, detail: "loopback port" };
    case "database.revealed":
      return { text: `Connection string for ${e.target} revealed`, detail: "" };
    case "domain.certificate":
      return { text: `Certificate issued for ${e.target}`, detail: String(d.issuer ?? "let's encrypt").toLowerCase() };
    case "alerts.updated":
      return { text: `Alert targets updated`, detail: e.target };
    case "domain.misconfigured":
      return { text: `${e.target} no longer points here`, detail: d.dns === "missing" ? "DNS record missing" : "DNS points elsewhere" };
    case "domain.added":
      return { text: `Domain ${e.target} added`, detail: String(d.project ?? "") };
    case "domain.removed":
      return { text: `Domain ${e.target} removed`, detail: String(d.project ?? "") };
    case "project.created":
      return { text: `Project ${e.target} created`, detail: String(d.repo ?? "") };
    case "project.deleted":
      return { text: `Project ${e.target} deleted`, detail: "" };
    case "project.standby":
      return { text: `${e.target} put on standby`, detail: d.freedMb ? `freed ${d.freedMb} MB` : "" };
    case "project.started":
      return { text: `${e.target} started`, detail: "" };
    case "project.settings":
      return { text: `Settings changed for ${e.target}`, detail: String(d.fields ?? "") };
    case "env.updated":
      return { text: `Environment changed for ${e.target}`, detail: String(d.keys ?? "") };
    case "deploy.live":
      return { text: `${e.target} #${d.number} is live`, detail: String(d.sha ?? "") };
    case "deploy.failed":
      return { text: `${e.target} #${d.number} failed`, detail: String(d.step ?? "") };
    case "deploy.rollback":
      return { text: `${e.target} rolled back to #${d.number}`, detail: "" };
    case "database.created":
      return { text: `Database ${e.target} created`, detail: String(d.engine ?? "") };
    case "database.linked":
      return { text: `${e.target} linked`, detail: String(d.envKey ?? "") };
    default:
      return { text: `${e.action} · ${e.target}`, detail: "" };
  }
}
