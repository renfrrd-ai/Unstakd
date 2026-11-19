import { Suspense } from "react";
import { PageMain } from "@/components/layout/app-header";
import { DeploymentList } from "@/components/deployments/deployment-list";
import { SectionHeader } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { loadProject } from "@/server/load-project";
import { listDeployments, listPreviews } from "@/server/queries";
import Link from "next/link";
import { Mono } from "@/components/ui/panel";
import { Pill } from "@/components/ui/pill";
import { previewHost, publicUrl } from "@/lib/domains";
import { env } from "@/lib/env";
import { timeAgo } from "@/lib/format";
import { deploymentLabel } from "@/lib/status";

export default function DeploymentsPage({ params }: PageProps<"/projects/[slug]/deployments">) {
  return (
    <PageMain>
      <SectionHeader title="Deployments" description="The last 10 images are kept, so rolling back starts instantly without a rebuild." />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <All params={params} />
      </Suspense>
    </PageMain>
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
        <section aria-labelledby="prev-h" className="flex flex-col gap-3.5">
          <SectionHeader id="prev-h" title="Pull request previews" description={p.previewsEnabled ? "Each open PR gets its own URL; closing the PR removes it." : "Preview deploys are off (Settings)."} />
          {perPr.length === 0 ? (
            <p className="m-0 text-muted">No previews yet. Open a pull request into {p.branch}.</p>
          ) : (
            <ul className="m-0 list-none rounded-xl border border-border bg-panel p-0 [&>li+li]:border-t [&>li+li]:border-border">
              {perPr.map((d) => {
                const host = previewHost(p.slug, d.previewPr!, env().APPS_DOMAIN);
                const label = deploymentLabel[d.status];
                return (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <Pill tone={d.status === "superseded" ? "neutral" : label.tone}>{d.status === "superseded" ? "Closed" : label.label}</Pill>
                      <Link href={`/projects/${p.slug}/deployments/${d.number}`} className="text-text hover:underline">PR #{d.previewPr} {d.commitMessage}</Link>
                    </span>
                    <span className="flex items-center gap-3">
                      {d.status === "live" && <a href={publicUrl(host)} target="_blank" rel="noreferrer" className="font-mono text-[13px] text-accent-text hover:underline">{host}</a>}
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
