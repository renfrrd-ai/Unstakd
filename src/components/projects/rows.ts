import { timeAgo } from "@/lib/format";
import type { ProjectSummary } from "@/server/queries";
import type { ProjectRow } from "./project-list";

export function toRow(p: ProjectSummary): ProjectRow {
  const l = p.latest;
  let detail = "no deploys yet";
  if (l && p.health === "attention" && p.live) {
    detail = `serving #${p.live.number} · #${l.number} failed ${timeAgo(l.finishedAt ?? l.createdAt)}`;
  } else if (l) {
    detail = `${l.commitMessage ?? `deploy #${l.number}`} · ${timeAgo(l.createdAt)}`;
  }
  return {
    slug: p.slug,
    name: p.name,
    host: p.primaryHost,
    detail,
    health: p.health,
    buildingSince: p.health === "building" ? (l?.startedAt ?? l?.createdAt)?.toISOString() : undefined,
  };
}
