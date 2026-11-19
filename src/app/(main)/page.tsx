import Link from "next/link";
import { Suspense } from "react";
import { PageMain } from "@/components/layout/app-header";
import { ActivityList } from "@/components/projects/activity-list";
import { ProjectList } from "@/components/projects/project-list";
import { toRow } from "@/components/projects/rows";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, Panel } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import { duration, greeting, timeAgo } from "@/lib/format";
import { hostStats } from "@/server/host-stats";
import { deployStats, listProjects, recentActivity } from "@/server/queries";

export default function OverviewPage() {
  return (
    <PageMain>
      <Suspense fallback={<Skeleton className="h-60" />}>
        <Hero />
      </Suspense>
      <Suspense fallback={<Skeleton className="h-32" />}>
        <ServerStats />
      </Suspense>
      <Suspense fallback={<Skeleton className="h-80" />}>
        <Projects />
      </Suspense>
      <section aria-labelledby="act-h" className="flex flex-col gap-3.5">
        <h2 id="act-h" className="m-0 text-lg font-semibold">Activity</h2>
        <Suspense fallback={<Skeleton className="h-40" />}>
          <Activity />
        </Suspense>
      </section>
    </PageMain>
  );
}

async function Hero() {
  const projects = await listProjects();
  const up = projects.filter((p) => p.state === "active" && p.liveDeploymentId).length;
  const failing = projects.filter((p) => p.health === "attention");
  const first = failing[0];

  return (
    <Panel className="flex flex-wrap items-stretch justify-between gap-5 p-5 sm:p-7">
      <div className="flex flex-col justify-between gap-4.5">
        <div>
          <p className="m-0 font-mono text-xs text-muted">{greeting(new Date().getHours())}</p>
          <h1 className="mt-2 font-display text-[38px] leading-[1.05] font-bold tracking-[-0.03em] sm:text-[46px]">
            {up} app{up === 1 ? "" : "s"} up.
            <br />
            {failing.length > 0 ? (
              <span className="text-err">{failing.length} need{failing.length === 1 ? "s" : ""} you.</span>
            ) : (
              <span className="text-accent-text">All good.</span>
            )}
          </h1>
        </div>
        <ButtonLink href="/new" variant="primary" className="self-start">+ New project</ButtonLink>
      </div>
      {first?.latest && (
        <Link
          href={`/projects/${first.slug}/deployments/${first.latest.number}`}
          className="flex flex-[0_1_380px] flex-col gap-2 rounded-[10px] border border-err-border bg-err-bg px-5 py-4.5 text-text"
        >
          <span className="font-mono text-xs font-bold text-err">
            ✕ FAILED · {first.name} #{first.latest.number} · {timeAgo(first.latest.finishedAt ?? first.latest.createdAt)}
          </span>
          <span className="leading-normal">
            {first.latest.commitMessage ?? "Deploy failed"}.{" "}
            {first.live ? <><strong>#{first.live.number} is still serving</strong>, so nothing is down.</> : "Nothing was live before this deploy."}
          </span>
          {first.latest.error && <span className="font-mono text-xs text-soft">{first.latest.error}</span>}
          <span className="font-semibold text-err">Open logs →</span>
        </Link>
      )}
      {!first && projects.length === 0 && (
        <div className="flex flex-[0_1_380px] flex-col justify-center gap-2 rounded-[10px] border border-border bg-bg px-5 py-4.5">
          <span className="font-mono text-xs font-bold text-accent-text">● READY</span>
          <span className="leading-normal">Pick a GitHub repo and Unstakd builds it, gives it HTTPS, and redeploys on every push.</span>
        </div>
      )}
    </Panel>
  );
}

async function ServerStats() {
  const [host, deploys] = await Promise.all([hostStats(), deployStats()]);
  const fmt = (n: number) => (n < 10 ? n.toFixed(1) : Math.round(n).toString());
  return (
    <section aria-label={`Server ${host.hostname}`} className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <StatCard label="CPU" value={host.cpu} unit="%" percent={host.cpu} />
      <StatCard label="Memory" value={fmt(host.memUsedGb)} unit={` / ${Math.round(host.memTotalGb)} GB`} percent={(100 * host.memUsedGb) / host.memTotalGb} />
      <StatCard label="Disk" value={Math.round(host.diskUsedGb)} unit={` / ${Math.round(host.diskTotalGb)} GB`} percent={(100 * host.diskUsedGb) / host.diskTotalGb} />
      <StatCard label="Deploys this week" value={deploys.count} footnote={deploys.medianMs ? `median ${duration(deploys.medianMs)} to live` : "no finished deploys yet"} />
    </section>
  );
}

async function Projects() {
  const projects = await listProjects();
  if (projects.length === 0) {
    return (
      <section className="flex flex-col gap-3.5">
        <h2 className="m-0 text-lg font-semibold">Projects</h2>
        <EmptyState title="No projects yet">Create one from a GitHub repo to get started.</EmptyState>
      </section>
    );
  }
  return <ProjectList title="Projects" rows={projects.map(toRow)} />;
}

async function Activity() {
  return <ActivityList events={await recentActivity(6)} />;
}
