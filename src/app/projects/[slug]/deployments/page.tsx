import { Suspense } from "react";
import { PageMain } from "@/components/layout/app-header";
import { DeploymentList } from "@/components/deployments/deployment-list";
import { SectionHeader } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { loadProject } from "@/server/load-project";
import { listDeployments } from "@/server/queries";

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
  return <DeploymentList slug={p.slug} deployments={await listDeployments(p.id, 50)} liveId={p.liveDeploymentId} />;
}
