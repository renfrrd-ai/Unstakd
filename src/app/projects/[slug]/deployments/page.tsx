import Link from "next/link";
import { Suspense } from "react";
import { DeploymentList } from "@/components/deployments/deployment-list";
import { ProjectMain } from "@/components/layout/page";
import { Mono, SectionHeader } from "@/components/ui/panel";
import { Pill } from "@/components/ui/pill";
import { Skeleton } from "@/components/ui/skeleton";
import { previewHost, publicUrl } from "@/lib/domains";
import { env } from "@/lib/env";
import { timeAgo } from "@/lib/format";
import { deploymentLabel } from "@/lib/status";
import { loadProject } from "@/server/load-project";
import { listDeployments, listPreviews } from "@/server/queries";

export default function DeploymentsPage({ params }: PageProps<"/projects/[slug]/deployments">) {
  return (
    <ProjectMain>
      <SectionHeader title="Deployments" description="The last 10 images are kept, so rolling back starts instantly without a rebuild." />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <All params={params} />
      </Suspense>
    </ProjectMain>
  );
}

async function All({ params }: { params: PageProps<"/projects/[slug]/deployments">["params"] }) {
  const p = await loadProject(params);
  const [deployments, previews] = await Promise.all([listDeployments(p.id, 50), listPreviews(p.id, 20)]);
  // Latest preview per PR only.
  const perPr = [...new Map(previews.map((d) => [d.previewPr!, d])).values()];
  return (
    <>
      <DeploymentList slug={p.slug} deployments={deployments} liveId={p.liveDeploymentId} />
      {(p.previewsEnabled || perPr.length > 0) && (
        <section aria-labelledby="prev-h" className="flex flex-col gap-4">
          <SectionHeader id="prev-h" title="Pull request previews" description={p.previewsEnabled ? "Each open PR gets its own URL; closing the PR removes it." : "Preview deploys are off (Settings)."} />
          {perPr.length === 0 ? (
            <p className="m-0 text-muted">No previews yet. Open a pull request into {p.branch}.</p>
          ) : (
            <ul className="m-0 list-none overflow-hidden rounded-[18px] border border-border bg-panel p-0 [&>li+li]:border-t [&>li+li]:border-border">
              {perPr.map((d) => {
                const host = previewHost(p.slug, d.previewPr!, env().APPS_DOMAIN);
                const label = deploymentLabel[d.status];
                return (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <Pill tone={d.status === "superseded" ? "neutral" : label.tone}>{d.status === "superseded" ? "Closed" : label.label}</Pill>
                      <Link href={`/projects/${p.slug}/deployments/${d.number}`} className="font-medium text-text hover:text-accent-text">PR #{d.previewPr} {d.commitMessage}</Link>
                    </span>
                    <span className="flex items-center gap-3">
                      {d.status === "live" && <a href={publicUrl(host)} target="_blank" rel="noreferrer" className="text-[13px] font-medium text-accent-text hover:text-accent-strong">{host}</a>}
                      <Mono className="text-muted">{timeAgo(d.createdAt)}</Mono>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
