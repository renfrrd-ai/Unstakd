import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { rollback } from "@/app/projects/[slug]/actions";
import { LogTabs, LogViewer } from "@/components/deployments/log-viewer";
import { StepChips } from "@/components/deployments/step-track";
import { PageMain, PageTitle } from "@/components/layout/page";
import { ActivityList } from "@/components/projects/activity-list";
import { ProjectAction } from "@/components/projects/project-action";
import { ProjectTable } from "@/components/projects/project-table";
import { toView, type ProjectView } from "@/components/projects/view";
import { ButtonLink } from "@/components/ui/button";
import { hotText, Meter, pctText } from "@/components/ui/meter";
import { EmptyState, KeyValues, Panel } from "@/components/ui/panel";
import { Pill } from "@/components/ui/pill";
import { Skeleton } from "@/components/ui/skeleton";
import { SoonBadge, SoonButton } from "@/components/ui/soon";
import { bytes } from "@/lib/format";
import { readLog } from "@/lib/logs";
import { healthPill, isInProgress } from "@/lib/status";
import { vcpu } from "@/lib/usage";
import { hostStats } from "@/server/host-stats";
import { latestMetrics, listDatabases, listDeployments, listProjects, projectActivity, type ProjectSummary } from "@/server/queries";

export const metadata: Metadata = { title: "Projects" };

type Props = PageProps<"/projects">;

export default function ProjectsPage({ searchParams }: Props) {
  return (
    <PageMain className="gap-6">
      <Suspense fallback={<><Skeleton className="h-16 border-0 bg-transparent" /><Skeleton className="h-80" /><Skeleton className="h-96" /></>}>
        <Projects searchParams={searchParams} />
      </Suspense>
    </PageMain>
  );
}

async function Projects({ searchParams }: { searchParams: Props["searchParams"] }) {
  const [projects, metrics, dbs, host, params] = await Promise.all([listProjects(), latestMetrics(), listDatabases(), hostStats(), searchParams]);

  if (projects.length === 0) {
    return (
      <>
        <PageTitle title="Projects" description="Pick a project to see its build and runtime logs." />
        <EmptyState title="Deploy your first app">
          <span>Pick a GitHub repo and Unstakd builds it, gives it HTTPS, and redeploys on every push.</span>
          <ButtonLink href="/new" variant="primary">New project</ButtonLink>
        </EmptyState>
      </>
    );
  }

  const dbFor = (projectId: string) => {
    const d = dbs.find((x) => x.links.some((l) => l.link.projectId === projectId));
    return d ? `${d.name} · ${d.engine === "postgres" ? "Postgres" : "Redis"} ${d.version}` : null;
  };
  const views = projects.map((p) => toView(p, metrics.get(p.id), dbFor(p.id)));
  const wanted = typeof params.p === "string" ? params.p : undefined;
  const sel = projects.find((p) => p.slug === wanted) ?? projects[0];
  const selView = views.find((v) => v.slug === sel.slug)!;
  const tab = params.log === "runtime" ? "runtime" : "build";
  const sampled = views.filter((v) => v.memBytes != null);
  const memUsed = sampled.length ? bytes(sampled.reduce((a, v) => a + v.memBytes!, 0)) : "—";

  return (
    <>
      <ProjectTable
        rows={views}
        selected={sel.slug}
        logTab={tab}
        description="Pick a project to see its build and runtime logs."
        footer={{ label: `${host.hostname} · ${vcpu(host.cores)} · ${Math.round(host.memTotalGb)} GB`, cpu: `${host.cpu}% of server`, mem: memUsed }}
      />
      <div className="flex flex-wrap items-stretch gap-6">
        <Suspense fallback={<Skeleton className="min-h-96 flex-[999_1_560px] bg-log-bg" />}>
          <LogPanel p={sel} tab={tab} />
        </Suspense>
        <Suspense fallback={<Skeleton className="min-h-96 flex-[1_1_320px]" />}>
          <SidePanel p={sel} v={selView} hostname={host.hostname} />
        </Suspense>
      </div>
    </>
  );
}

async function LogPanel({ p, tab }: { p: ProjectSummary; tab: "build" | "runtime" }) {
  const deployments = await listDeployments(p.id, 10);
  const latest = deployments[0];
  const target = deployments.find((d) => d.imageTag && d.id !== p.liveDeploymentId && (d.status === "superseded" || d.status === "live"));
  const tabs = (["build", "runtime"] as const).map((t) => ({ label: t === "build" ? "Build" : "Runtime", href: `/projects?p=${p.slug}&log=${t}`, active: tab === t }));
  const actions = (
    <>
      <LogTabs items={tabs} />
      {target && (
        <form action={rollback.bind(null, p.slug, target.number)}>
          <button type="submit" title={`Roll back to #${target.number}`} className="cursor-pointer rounded-lg border border-log-line px-3 py-1.5 text-xs font-medium text-log-text hover:bg-log-chip">
            Roll back
          </button>
        </form>
      )}
    </>
  );
  const className = "min-h-96 flex-[999_1_560px]";

  if (tab === "build") {
    if (!latest) {
      return <LogViewer key="none" className={className} initial={[]} actions={actions} title={<span className="text-[15px] font-semibold">{p.name}</span>} empty="No deploys yet. Push to the tracked branch or press Deploy." />;
    }
    const running = isInProgress(latest);
    const lines = running ? [] : await readLog(latest.id);
    return (
      <LogViewer
        key={latest.id}
        className={className}
        initial={lines}
        streamUrl={running ? `/api/deployments/${latest.id}/logs` : undefined}
        actions={actions}
        toolbar={<StepChips steps={latest.steps} />}
        title={
          <>
            <Link href={`/projects/${p.slug}/deployments/${latest.number}`} className="text-[15px] font-semibold text-log-text hover:underline">
              {p.name} · build #{latest.number}
            </Link>
            <span className="truncate text-xs text-log-muted">{latest.commitMessage ?? latest.trigger}</span>
          </>
        }
        empty={running ? "Waiting for the worker to pick this up…" : "No build output was recorded."}
      />
    );
  }

  const live = p.live;
  const canStream = !!live?.containerName && p.state !== "standby";
  return (
    <LogViewer
      key={`rt-${p.slug}-${live?.id ?? "none"}`}
      className={className}
      initial={[]}
      clock
      streamUrl={canStream ? `/api/projects/${p.slug}/logs` : undefined}
      actions={actions}
      title={
        <>
          <span className="text-[15px] font-semibold">{p.name} · runtime</span>
          <span className="text-xs text-log-muted">{live ? `#${live.number} · ${live.commitMessage ?? "live"}` : "not live yet"}</span>
        </>
      }
      empty={
        !live
          ? "Logs appear once a deploy goes live."
          : !live.containerName
            ? "Static site: Caddy serves the files directly, so there's no process to log."
            : p.state === "standby"
              ? "On standby. Start the app to see live logs."
              : "Waiting for output…"
      }
    />
  );
}

async function SidePanel({ p, v, hostname }: { p: ProjectSummary; v: ProjectView; hostname: string }) {
  const events = await projectActivity(p.name, 4);
  const pill = healthPill[p.health];
  return (
    <Panel className="flex min-w-0 flex-[1_1_320px] flex-col gap-4.5 p-5.5">
      <div className="flex items-center justify-between gap-2.5">
        <h2 className="m-0 min-w-0 truncate text-lg font-semibold">
          <Link href={`/projects/${p.slug}`} className="hover:text-accent-text">{p.name}</Link>
        </h2>
        <Pill tone={pill.tone}>{pill.label}</Pill>
      </div>
      {v.isStatic ? (
        <p className="m-0 rounded-xl bg-sunken px-3.5 py-3 text-[13px] text-muted">Static site: no container, so no CPU or memory to measure.</p>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <span className="text-[13px] text-muted">CPU used of allocation</span>
            <span className={`text-[22px] font-bold ${hotText(v.cpu)}`}>{pctText(v.cpu)}</span>
          </div>
          <Meter percent={v.cpu} size="lg" label="CPU used of allocation" />
          <span className="text-xs text-muted">{vcpu(v.alloc)} allocated on {hostname}</span>
        </div>
      )}
      <KeyValues
        rows={[
          ["Memory", v.isStatic ? "—" : `${bytes(v.memBytes)} of ${bytes(v.memLimitBytes)}`],
          ["Domain", <Link key="d" href={`/projects/${p.slug}/domains`} className="text-accent-text hover:text-accent-strong">{v.host}</Link>],
          ["Database", v.db ?? <span key="n" className="text-muted">None</span>],
          ["Cost", <span key="c" className="inline-flex items-center gap-1.5 text-dim">— <SoonBadge /></span>],
        ]}
      />
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-muted">Recent activity</span>
        <ActivityList events={events} bare />
      </div>
      <div className="mt-auto flex flex-wrap gap-2">
        <ProjectAction p={v} size="md" />
        <ButtonLink href={`/projects/${p.slug}/environment`}>Environment</ButtonLink>
        <SoonButton>Show on map</SoonButton>
      </div>
    </Panel>
  );
}
