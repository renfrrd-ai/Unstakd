import type { AuditEvent } from "@/db/schema";

// Human sentence + mono detail for an audit event, as shown in Activity lists.
export function describeEvent(e: Pick<AuditEvent, "action" | "target" | "details">): { text: string; detail: string } {
  const d = (e.details ?? {}) as Record<string, string | number | undefined>;
  switch (e.action) {
    case "backup.completed":
      return { text: `Backups finished for ${e.target}`, detail: `sent to ${d.destination ?? "R2"}` };
    case "backup.failed":
      return { text: `Backup failed for ${e.target}`, detail: String(d.error ?? "") };
    case "domain.certificate":
      return { text: `Certificate issued for ${e.target}`, detail: String(d.issuer ?? "let's encrypt").toLowerCase() };
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
