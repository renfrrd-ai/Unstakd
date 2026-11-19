import { notFound } from "next/navigation";
import { Suspense } from "react";
import { cancel } from "@/app/projects/[slug]/actions";
import { PageMain } from "@/components/layout/app-header";
import { LogViewer } from "@/components/deployments/log-viewer";
import { StepTrack } from "@/components/deployments/step-track";
import { Elapsed } from "@/components/projects/elapsed";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import type { Deployment } from "@/db/schema";
import { duration, shortSha, timeAgo } from "@/lib/format";
import { readLog } from "@/lib/logs";
import { previewHost, publicUrl } from "@/lib/domains";
import { env } from "@/lib/env";
import { deploymentLabel, isInProgress, toneText } from "@/lib/status";
import { loadProject } from "@/server/load-project";
import { getDeployment } from "@/server/queries";

type Props = PageProps<"/projects/[slug]/deployments/[number]">;

export default function DeploymentPage({ params }: Props) {
  return (
    <PageMain className="gap-5.5">
      <Suspense fallback={<Skeleton className="h-[520px]" />}>
        <Detail params={params} />
      </Suspense>
    </PageMain>
  );
}

const STEP_NAMES: Record<string, string> = { clone: "clone", build: "build", push: "push", start: "start", health: "health check", switch: "switch" };

function headline(d: Deployment) {
  const label = deploymentLabel[d.status];
  const failedStep = d.steps.find((s) => s.status === "failed");
  if (d.status === "failed") return `✕ FAILED${failedStep ? ` AT ${STEP_NAMES[failedStep.name].toUpperCase()}` : ""}`;
  return `${label.glyph} ${label.label.toUpperCase()}`;
}

async function Detail({ params }: { params: Props["params"] }) {
  const { number } = await params;
  const project = await loadProject(params);
  const n = Number(number);
  const d = Number.isInteger(n) ? await getDeployment(project.id, n) : null;
  if (!d) notFound();

  const running = isInProgress(d);
  const lines = running ? [] : await readLog(d.id);
  const total = d.finishedAt && d.startedAt ? d.finishedAt.getTime() - d.startedAt.getTime() : null;
  const isLive = d.id === project.liveDeploymentId || (!!d.previewPr && d.status === "live");
  const tone = isLive ? "text-accent-text" : toneText[deploymentLabel[d.status].tone];

  return (
    <>
      <div className="flex flex-wrap items-stretch justify-between gap-6">
        <div className="flex flex-col gap-2">
          <span className={`font-mono text-xs font-bold ${tone}`}>
            {isLive ? "● LIVE" : headline(d)} · {running ? <>started <Elapsed since={(d.startedAt ?? d.createdAt).toISOString()} /> ago</> : timeAgo(d.finishedAt ?? d.createdAt)}
          </span>
          <h1 className="m-0 font-display text-[34px] font-bold tracking-[-0.02em]">
            #{d.number} {d.commitMessage ?? d.trigger}
          </h1>
          <div className="flex flex-wrap gap-4 font-mono text-[13px] text-muted">
            <span>{d.branch} @ {shortSha(d.commitSha)}</span>
            <span>{project.buildMode}{project.framework ? ` · ${project.framework}` : ""}</span>
            <span>{d.trigger}</span>
            {total != null && <span>total {duration(total)}</span>}
          </div>
        </div>
        <SideCard
          d={d}
          running={running}
          isLive={isLive}
          slug={project.slug}
          liveNumber={d.previewPr ? undefined : project.live?.number}
          host={d.previewPr ? previewHost(project.slug, d.previewPr, env().APPS_DOMAIN) : project.primaryHost}
        />
      </div>

      <StepTrack steps={d.steps} />

      <LogViewer
        initial={lines}
        streamUrl={running ? `/api/deployments/${d.id}/logs` : undefined}
        header={<span className="rounded bg-panel-2 px-3.5 py-2 font-mono text-xs">build</span>}
        empty={running ? "Waiting for the worker to pick this up…" : "No build output was recorded."}
      />

      <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <InfoCard title={d.status === "failed" ? "Error" : "Result"}>
          {d.error ?? (d.status === "live" || d.status === "superseded" ? "Deployed successfully." : running ? "In progress." : "—")}
        </InfoCard>
        {d.status === "failed" && d.notified ? (
          <InfoCard title="Notified">{d.notified}.</InfoCard>
        ) : (
        <InfoCard title="Trigger">
          {d.previewPr ? `Pull request #${d.previewPr} (preview; the live deploy is untouched)` : d.trigger === "rollback" ? "Rollback (reused an existing image, no rebuild)" : d.trigger === "push" ? `Push to ${d.branch}` : d.trigger === "create" ? "First deploy" : "Manual redeploy"}
        </InfoCard>
        )}
        <InfoCard title="Image">
          <span className="font-mono text-[13px] break-all">{d.imageTag ?? "not built yet"}</span>
        </InfoCard>
      </section>
    </>
  );
}

function SideCard({ d, running, isLive, slug, liveNumber, host }: { d: Deployment; running: boolean; isLive: boolean; slug: string; liveNumber?: number; host: string }) {
  if (running) {
    return (
      <Panel className="flex flex-[0_1_360px] flex-col gap-2 px-4.5 py-4">
        <span className="font-mono text-xs font-bold text-warn">● IN PROGRESS</span>
        <span className="leading-normal">{liveNumber ? `#${liveNumber} keeps serving ${host} until this one passes its health check.` : "Nothing is live yet; this will be the first version."}</span>
        <form action={cancel.bind(null, slug, d.number)}>
          <Button type="submit" size="sm">Cancel deploy</Button>
        </form>
      </Panel>
    );
  }
  if (d.status === "failed" && liveNumber) {
    return (
      <Panel className="flex flex-[0_1_360px] flex-col gap-1.5 px-4.5 py-4">
        <span className="font-mono text-xs font-bold text-accent-text">● STILL LIVE: #{liveNumber}</span>
        <span className="leading-normal">{host} never went down. #{d.number} was stopped{d.imageTag ? " and its image kept for debugging" : ""}.</span>
      </Panel>
    );
  }
  if (isLive) {
    return (
      <Panel className="flex flex-[0_1_360px] flex-col gap-1.5 px-4.5 py-4">
        <span className="font-mono text-xs font-bold text-accent-text">● SERVING</span>
        <span className="leading-normal">
          {d.previewPr ? "Preview" : "This deploy"} is live at{" "}
          <a href={publicUrl(host)} target="_blank" rel="noreferrer" className="text-accent-text hover:underline">{host}</a>.
        </span>
      </Panel>
    );
  }
  return null;
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border p-4">
      <h2 className="m-0 mb-1.5 text-[13px] font-medium text-muted">{title}</h2>
      <div className="leading-normal">{children}</div>
    </div>
  );
}
