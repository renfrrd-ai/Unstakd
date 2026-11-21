import Link from "next/link";
import { rollback } from "@/app/projects/[slug]/actions";
import { Elapsed } from "@/components/projects/elapsed";
import { EmptyState, Mono } from "@/components/ui/panel";
import { Pill } from "@/components/ui/pill";
import type { Deployment } from "@/db/schema";
import { duration, shortSha, timeAgo } from "@/lib/format";
import { deploymentLabel } from "@/lib/status";

export function DeploymentList({ slug, deployments, liveId }: { slug: string; deployments: Deployment[]; liveId: string | null }) {
  if (deployments.length === 0) return <EmptyState title="No deployments yet">Push to the tracked branch or press Redeploy.</EmptyState>;
  return (
    <ol className="m-0 list-none overflow-hidden rounded-[18px] border border-border bg-panel p-0 [&>li+li]:border-t [&>li+li]:border-border">
      {deployments.map((d) => {
        const label = deploymentLabel[d.status];
        const running = ["queued", "building", "deploying"].includes(d.status);
        const isLive = d.id === liveId;
        const canRollback = !!d.imageTag && !isLive && (d.status === "superseded" || d.status === "live");
        const took = d.finishedAt && d.startedAt ? duration(d.finishedAt.getTime() - d.startedAt.getTime()) : null;
        return (
          <li key={d.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3.5 hover:bg-sunken">
            <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              <Pill tone={isLive ? "ok" : label.tone} className="min-w-20 justify-center">{isLive ? "Live" : label.label}</Pill>
              <Link href={`/projects/${slug}/deployments/${d.number}`} className="min-w-0 font-medium text-text hover:text-accent-text">
                <span className="text-muted">#{d.number}</span> {d.commitMessage ?? d.trigger}
              </Link>
            </span>
            <span className="flex items-center gap-3">
              <Mono className="text-muted">
                {shortSha(d.commitSha)} · {running ? <Elapsed since={(d.startedAt ?? d.createdAt).toISOString()} /> : (took ?? "—")} · {timeAgo(d.createdAt)}
              </Mono>
              {canRollback && (
                <form action={rollback.bind(null, slug, d.number)}>
                  <button type="submit" className="cursor-pointer rounded-lg bg-panel-2 px-2.5 py-1 text-xs font-medium hover:brightness-95">Roll back</button>
                </form>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
