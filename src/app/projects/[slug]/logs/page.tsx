import { Suspense } from "react";
import { LogViewer } from "@/components/deployments/log-viewer";
import { ProjectMain } from "@/components/layout/page";
import { EmptyState, SectionHeader } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { loadProject } from "@/server/load-project";

type Props = PageProps<"/projects/[slug]/logs">;

export default function LogsPage({ params }: Props) {
  return (
    <ProjectMain>
      <Suspense fallback={<Skeleton className="h-[560px] bg-log-bg" />}>
        <Logs params={params} />
      </Suspense>
    </ProjectMain>
  );
}

async function Logs({ params }: { params: Props["params"] }) {
  const p = await loadProject(params);
  return (
    <>
      <SectionHeader title="Logs" description="Live output from the running container, kept for 24 hours." />
      {!p.live ? (
        <EmptyState title="Nothing running yet">Logs appear once a deploy goes live.</EmptyState>
      ) : !p.live.containerName ? (
        <EmptyState title="Static site">Caddy serves the files directly, so there&apos;s no process to log. Build output is on each deploy&apos;s page.</EmptyState>
      ) : p.state === "standby" ? (
        <EmptyState title="On standby">Start the app from Settings to see live logs.</EmptyState>
      ) : (
        <LogViewer
          initial={[]}
          clock
          streamUrl={`/api/projects/${p.slug}/logs`}
          title={
            <>
              <span className="text-[15px] font-semibold">{p.name} · runtime</span>
              <span className="text-xs text-log-muted">#{p.live.number} · {p.live.commitMessage ?? "live"}</span>
            </>
          }
          empty="Waiting for output…"
        />
      )}
    </>
  );
}
