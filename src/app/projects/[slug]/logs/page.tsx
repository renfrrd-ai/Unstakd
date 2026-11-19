import { Suspense } from "react";
import { PageMain } from "@/components/layout/app-header";
import { LogViewer } from "@/components/deployments/log-viewer";
import { EmptyState, SectionHeader } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { loadProject } from "@/server/load-project";

type Props = PageProps<"/projects/[slug]/logs">;

export default function LogsPage({ params }: Props) {
  return (
    <PageMain>
      <Suspense fallback={<Skeleton className="h-[560px]" />}>
        <Logs params={params} />
      </Suspense>
    </PageMain>
  );
}

async function Logs({ params }: { params: Props["params"] }) {
  const p = await loadProject(params);
  return (
    <>
      <SectionHeader title="Logs" description="Live output from the running container, kept for 24 hours." />
      {!p.live ? (
        <EmptyState title="Nothing running yet">Logs appear once a deploy goes live.</EmptyState>
      ) : p.state === "standby" ? (
        <EmptyState title="On standby">Start the app from Settings to see live logs.</EmptyState>
      ) : (
        <LogViewer
          initial={[]}
          clock
          streamUrl={`/api/projects/${p.slug}/logs`}
          header={<span className="rounded bg-panel-2 px-3.5 py-2 font-mono text-xs">runtime · #{p.live.number}</span>}
          empty="Waiting for output…"
        />
      )}
    </>
  );
}
