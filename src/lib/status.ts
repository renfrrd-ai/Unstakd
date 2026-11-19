import type { Tone } from "@/components/ui/pill";
import type { Deployment, Project } from "@/db/schema";

export type ProjectHealth = "live" | "building" | "attention" | "standby" | "new";

const ACTIVE = new Set<Deployment["status"]>(["queued", "building", "deploying"]);

export function isInProgress(d: Pick<Deployment, "status">) {
  return ACTIVE.has(d.status);
}

// `latest` is the newest deployment by number; a failure only needs attention if nothing newer went live.
export function projectHealth(project: Pick<Project, "state" | "liveDeploymentId">, latest: Pick<Deployment, "id" | "status"> | undefined): ProjectHealth {
  if (project.state === "standby") return "standby";
  if (latest && isInProgress(latest)) return "building";
  if (latest?.status === "failed") return "attention";
  if (project.liveDeploymentId) return "live";
  return "new";
}

export const healthPill: Record<ProjectHealth, { tone: Tone; label: string }> = {
  live: { tone: "ok", label: "Live" },
  building: { tone: "warn", label: "Building" },
  attention: { tone: "err", label: "Needs attention" },
  standby: { tone: "neutral", label: "Standby" },
  new: { tone: "neutral", label: "Not deployed" },
};

export const deploymentLabel: Record<Deployment["status"], { tone: Tone; glyph: string; label: string }> = {
  queued: { tone: "warn", glyph: "◌", label: "Queued" },
  building: { tone: "warn", glyph: "◐", label: "Building" },
  deploying: { tone: "warn", glyph: "◑", label: "Deploying" },
  live: { tone: "ok", glyph: "●", label: "Live" },
  failed: { tone: "err", glyph: "✕", label: "Failed" },
  superseded: { tone: "neutral", glyph: "○", label: "Ready" },
  cancelled: { tone: "neutral", glyph: "○", label: "Cancelled" },
};

export const toneText: Record<Tone, string> = {
  ok: "text-accent-text",
  warn: "text-warn",
  err: "text-err",
  neutral: "text-muted",
  waiting: "text-warn",
};
