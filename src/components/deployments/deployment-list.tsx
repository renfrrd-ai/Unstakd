import Link from "next/link";
import { rollback } from "@/app/projects/[slug]/actions";
import { EmptyState, Mono } from "@/components/ui/panel";
import type { Deployment } from "@/db/schema";
import { duration, shortSha, timeAgo } from "@/lib/format";
import { deploymentLabel, toneText } from "@/lib/status";
import { Elapsed } from "@/components/projects/elapsed";

export function DeploymentList({ slug, deployments, liveId }: { slug: string; deployments: Deployment[]; liveId: string | null }) {
  if (deployments.length === 0) return <EmptyState title="No deployments yet">Push to the tracked branch or press Redeploy.</EmptyState>;
  return (
    <ol className="m-0 list-none rounded-xl border border-border bg-panel p-0 [&>li+li]:border-t [&>li+li]:border-border">
      {deployments.map((d) => {
        const label = deploymentLabel[d.status];
        const running = ["queued", "building", "deploying"].includes(d.status);
        const canRollback = !!d.imageTag && d.id !== liveId && (d.status === "superseded" || d.status === "live");
        const took = d.finishedAt && d.startedAt ? duration(d.finishedAt.getTime() - d.startedAt.getTime()) : null;
        return (
          <li key={d.id} className="flex flex-wrap items-center justify-between gap-4 px-5 py-3.5">
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className={`font-semibold ${toneText[label.tone]}`}>
                {label.glyph} {d.id === liveId ? "Live" : label.label}
              </span>
              <Link href={`/projects/${slug}/deployments/${d.number}`} className="text-text hover:underline">
                #{d.number} {d.commitMessage ?? d.trigger}
              </Link>
              {canRollback && (
                <form action={rollback.bind(null, slug, d.number)}>
                  <button type="submit" className="cursor-pointer text-accent-text hover:underline">Roll back</button>
                </form>
              )}
            </span>
            <Mono className="text-muted">
              {shortSha(d.commitSha)} · {running ? <Elapsed since={(d.startedAt ?? d.createdAt).toISOString()} /> : (took ?? "—")} · {timeAgo(d.createdAt)}
            </Mono>
          </li>
        );
      })}
    </ol>
  );
}
