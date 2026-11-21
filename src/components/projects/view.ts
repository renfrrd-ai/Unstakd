import type { AppMetric } from "@/db/schema";
import { shortSha, timeAgo } from "@/lib/format";
import type { ProjectHealth } from "@/lib/status";
import { cpuOfAllocation } from "@/lib/usage";
import type { ProjectSummary } from "@/server/queries";

// What the Dashboard cards, the Projects table and the project panel show for one app.
export type ProjectView = {
  slug: string;
  name: string;
  repo: string;
  host: string;
  health: ProjectHealth;
  stack: string;
  deployed: string;
  commit: string;
  commitMessage: string | null;
  latestNumber: number | null;
  buildingSince: string | null;
  isStatic: boolean;
  db: string | null;
  alloc: number;
  /** % of the app's own CPU allocation, null when there's no recent sample. */
  cpu: number | null;
  memBytes: number | null;
  memLimitBytes: number;
};

export function stackLabel(p: Pick<ProjectSummary, "buildMode" | "framework">) {
  if (p.buildMode === "static") return p.framework ? `Static · ${p.framework}` : "Static";
  return p.framework ?? (p.buildMode === "dockerfile" ? "Dockerfile" : "Railpack");
}

export function toView(p: ProjectSummary, metric: AppMetric | undefined, db: string | null): ProjectView {
  const l = p.latest;
  const current = p.live ?? l;
  let deployed = "not deployed";
  if (p.health === "building" && l) deployed = `build #${l.number}`;
  else if (p.health === "attention" && l) deployed = `#${l.number} failed ${timeAgo(l.finishedAt ?? l.createdAt)}`;
  else if (p.health === "standby") deployed = "on standby";
  else if (p.live) deployed = timeAgo(p.live.finishedAt ?? p.live.createdAt);

  const running = p.health !== "standby" && !!p.live?.containerName;
  return {
    slug: p.slug,
    name: p.name,
    repo: p.repo,
    host: p.primaryHost,
    health: p.health,
    stack: stackLabel(p),
    deployed,
    commit: shortSha(current?.commitSha),
    commitMessage: current?.commitMessage ?? null,
    latestNumber: l?.number ?? null,
    buildingSince: p.health === "building" && l ? (l.startedAt ?? l.createdAt).toISOString() : null,
    isStatic: p.buildMode === "static",
    db,
    alloc: p.cpuLimit,
    cpu: running ? cpuOfAllocation(metric?.cpuPct, p.cpuLimit) : null,
    memBytes: running ? (metric?.memBytes ?? null) : null,
    memLimitBytes: p.memoryMb * 1024 * 1024,
  };
}

export function healthCounts(views: Pick<ProjectView, "health">[]) {
  const n = (h: ProjectHealth) => views.filter((v) => v.health === h).length;
  return { live: n("live"), building: n("building"), attention: n("attention"), standby: n("standby"), new: n("new") };
}

export function countsLine(views: Pick<ProjectView, "health">[]) {
  const c = healthCounts(views);
  return [
    c.live && `${c.live} live`,
    c.building && `${c.building} building`,
    c.attention && `${c.attention} failed`,
    c.standby && `${c.standby} on standby`,
    c.new && `${c.new} not deployed`,
  ]
    .filter(Boolean)
    .join(" · ");
}
