import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageMain, PageTitle } from "@/components/layout/app-header";
import { ActivityList } from "@/components/projects/activity-list";
import { AllocationCard } from "@/components/projects/allocation-card";
import { ConnectRepoCard, ProjectCard } from "@/components/projects/project-card";
import { countsLine, toView } from "@/components/projects/view";
import { CardHeader, Panel } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { Inactive, SoonButton, SoonLink } from "@/components/ui/soon";
import { StatCard } from "@/components/ui/stat-card";
import { env } from "@/lib/env";
import { timeAgo } from "@/lib/format";
import { hostStats } from "@/server/host-stats";
import { latestMetrics, listDatabases, listDomains, listProjects, recentActivity } from "@/server/queries";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <PageMain>
      <Suspense fallback={<DashboardSkeleton />}>
        <Dashboard />
      </Suspense>
    </PageMain>
  );
}

function DashboardSkeleton() {
  return (
    <>
      <Skeleton className="h-16 border-0 bg-transparent" />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}
      </div>
      <Skeleton className="h-96" />
    </>
  );
}

async function Dashboard() {
  const [projects, metrics, dbs, activity, host, domains] = await Promise.all([
    listProjects(),
    latestMetrics(),
    listDatabases(),
    recentActivity(6),
    hostStats(),
    listDomains(),
  ]);

  const dbFor = (projectId: string) => {
    const d = dbs.find((x) => x.links.some((l) => l.link.projectId === projectId));
    return d ? `${d.name} · ${d.engine === "postgres" ? "Postgres" : "Redis"} ${d.version}` : null;
  };
  const views = projects.map((p) => toView(p, metrics.get(p.id), dbFor(p.id)));
  const allocated = views.filter((v) => !v.isStatic).reduce((a, v) => a + v.alloc, 0);
  const failing = projects.filter((p) => p.health === "attention" && p.latest);
  const customDomains = domains.filter((d) => !d.domain.hostname.endsWith(`.${env().APPS_DOMAIN}`)).length;

  return (
    <>
      <PageTitle
        title="Dashboard"
        description={
          <>
            {projects.length} project{projects.length === 1 ? "" : "s"}. <span className="text-dim">1 server.</span>
          </>
        }
        actions={<SoonButton variant="outline">Open map</SoonButton>}
      />

      {failing.map((p) => (
        <Link
          key={p.id}
          href={`/projects/${p.slug}/deployments/${p.latest!.number}`}
          className="-mt-2 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-err-border bg-err-bg px-5 py-3.5 text-text"
        >
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-[13px] font-semibold text-err">{p.name} #{p.latest!.number} failed · {timeAgo(p.latest!.finishedAt ?? p.latest!.createdAt)}</span>
            <span className="text-[13px]">{p.live ? <><strong>#{p.live.number} is still serving</strong>, so nothing is down.</> : "Nothing was live before this deploy."}</span>
          </span>
          <span className="text-[13px] font-semibold text-err">Open logs →</span>
        </Link>
      ))}

      <section aria-label="Summary" className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
        <StatCard label="Projects" value={projects.length} footnote={countsLine(views) || "nothing deployed yet"} />
        <StatCard label="CPU used" value={`${host.cpu}%`} percent={host.cpu} footnote={`of ${host.cores} vCPU on ${host.hostname} · ${allocated} allocated`} />
        <StatCard
          label="Memory"
          value={`${host.memUsedGb.toFixed(1)} GB`}
          percent={(100 * host.memUsedGb) / host.memTotalGb}
          footnote={`of ${Math.round(host.memTotalGb)} GB`}
        />
        <Inactive label="Billing is coming soon">
          <StatCard label="This month" value="—" footnote="One bill for everything you host" />
        </Inactive>
      </section>

      <div className="flex flex-wrap items-start gap-6">
        <section aria-labelledby="projects-h" className="flex min-w-0 flex-[999_1_560px] flex-col gap-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="projects-h" className="m-0 text-lg font-semibold">Projects</h2>
            <Link href="/projects" className="text-[13px] font-medium text-accent-text hover:text-accent-strong">See table and logs →</Link>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))] gap-4">
            {views.map((p) => <ProjectCard key={p.slug} p={p} />)}
            <ConnectRepoCard />
          </div>
        </section>

        <aside className="flex min-w-0 flex-[1_1_340px] flex-col gap-4">
          <AllocationCard projects={views} cores={host.cores} hostname={host.hostname} />
          <Panel className="flex flex-col gap-1.5 p-5">
            <CardHeader title="Activity" aside={<Link href="/activity" className="font-medium text-accent-text hover:text-accent-strong">All activity</Link>} />
            <ActivityList events={activity} bare />
          </Panel>
          <Inactive label="Server migration is coming soon">
            <section className="flex flex-col gap-1.5 rounded-[18px] bg-accent-soft p-5">
              <span className="text-xs font-semibold text-accent-strong">Planned</span>
              <h2 className="m-0 text-base font-semibold">Move to OVHcloud</h2>
              <p className="m-0 text-[13px] text-soft">
                {host.hostname} is a temporary server. Snapshot {dbs.length} database{dbs.length === 1 ? "" : "s"}, repoint {customDomains} custom domain
                {customDomains === 1 ? "" : "s"}, then cut over.
              </p>
              <SoonLink className="mt-1">Plan the migration →</SoonLink>
            </section>
          </Inactive>
        </aside>
      </div>
    </>
  );
}
